#!/usr/bin/python3
"""One-shot, serialized GitHub Deployment poller for the YOLPOL host."""

from __future__ import annotations

import fcntl
import json
import os
import pwd
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from yolpol_control_plane import (
    CONTROLLER_HANDLED_EXIT,
    CONTROLLER_RETRYABLE_EXIT,
    CONTROLLER_TERMINAL_REJECT_EXIT,
    ControlPlaneError,
    GitHubAppClient,
    HostConfig,
    load_host_config,
    retry_delay,
)


CONFIG_PATH = Path("/etc/yolpol/control-plane/agent.json")
STATE_DIRECTORY = Path("/var/lib/yolpol-deployment-agent")
STATE_PATH = STATE_DIRECTORY / "poll-state.json"
LOCK_PATH = STATE_DIRECTORY / "poll.lock"
EXPECTED_USER = "yolpol-deployment-agent"
MAX_SEEN = 200
HANDLED = "handled"
TERMINAL_REJECT = "terminal-reject"
RETRYABLE = "retryable"


def fail(message: str) -> None:
    raise ControlPlaneError(message)


def atomic_state(value: dict[str, Any]) -> None:
    content = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"
    descriptor, name = tempfile.mkstemp(prefix=".poll-state.", dir=STATE_DIRECTORY)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            os.fchmod(stream.fileno(), 0o600)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, STATE_PATH)
        directory = os.open(STATE_DIRECTORY, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def load_state() -> dict[str, Any]:
    initial: dict[str, Any] = {"schemaVersion": 1, "failures": 0, "nextPollUnix": 0, "etags": {}, "seen": []}
    if not STATE_PATH.exists():
        return initial
    try:
        value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ControlPlaneError("agent state rejected") from error
    if (
        not isinstance(value, dict) or set(value) != set(initial)
        or value.get("schemaVersion") != 1
        or isinstance(value.get("failures"), bool) or not isinstance(value.get("failures"), int)
        or not 0 <= int(value["failures"]) <= 7
        or isinstance(value.get("nextPollUnix"), bool) or not isinstance(value.get("nextPollUnix"), int)
        or int(value["nextPollUnix"]) < 0 or not isinstance(value.get("etags"), dict)
        or set(value["etags"]) - {"staging", "production"}
        or any(not isinstance(item, str) or len(item) > 512 for item in value["etags"].values())
        or not isinstance(value.get("seen"), list) or len(value["seen"]) > MAX_SEEN
        or any(not isinstance(item, str) or not item.isdecimal() or item == "0" for item in value["seen"])
        or len(set(value["seen"])) != len(value["seen"])
    ):
        fail("agent state rejected")
    return value


def controller_submission(deployment: dict[str, Any], environment: str) -> bytes:
    deployment_id = deployment.get("id")
    if isinstance(deployment_id, bool) or not isinstance(deployment_id, int) or deployment_id <= 0:
        fail("discovered Deployment ID rejected")
    payload = deployment.get("payload")
    if not isinstance(payload, dict):
        fail("discovered Deployment payload rejected")
    return json.dumps({
        "schemaVersion": 1,
        "deploymentId": str(deployment_id),
        "environment": environment,
        "envelope": payload,
    }, separators=(",", ":"), sort_keys=False).encode("utf-8")


def invoke_controller(deployment: dict[str, Any], environment: str) -> str:
    action = "apply-staging-intent" if environment == "staging" else "apply-production-intent"
    try:
        result = subprocess.run(
            ["/usr/bin/sudo", "-n", "/opt/yolpol/bin/yolpol-deploy", action],
            input=controller_submission(deployment, environment),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=4_800,
            env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
        )
    except (OSError, subprocess.SubprocessError):
        return RETRYABLE
    if result.returncode == CONTROLLER_HANDLED_EXIT:
        return HANDLED
    if result.returncode == CONTROLLER_TERMINAL_REJECT_EXIT:
        return TERMINAL_REJECT
    if result.returncode == CONTROLLER_RETRYABLE_EXIT:
        return RETRYABLE
    return RETRYABLE


def poll_environment(client: GitHubAppClient, state: dict[str, Any], environment: str) -> None:
    etag_value = state["etags"].get(environment)
    etag = etag_value if isinstance(etag_value, str) and len(etag_value) <= 512 else None
    response = client.list_deployments(environment, etag=etag)
    if response.status == 304:
        return
    if response.status != 200:
        delay = retry_delay(response.headers, int(state["failures"]))
        state["nextPollUnix"] = int(time.time()) + delay
        fail("GitHub polling temporarily unavailable")
    try:
        values = json.loads(response.body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ControlPlaneError("Deployment list rejected") from error
    if not isinstance(values, list) or len(values) > 20:
        fail("Deployment list rejected")
    response_etag = response.headers.get("etag")
    candidate_etag = response_etag if response_etag is not None and len(response_etag) <= 512 else None
    seen = {str(value) for value in state["seen"]}
    retryable_found = False
    for deployment in reversed(values):
        if not isinstance(deployment, dict):
            fail("Deployment list entry rejected")
        deployment_id = deployment.get("id")
        if isinstance(deployment_id, bool) or not isinstance(deployment_id, int) or deployment_id <= 0:
            fail("Deployment list entry rejected")
        identity = str(deployment_id)
        if identity in seen:
            continue
        try:
            outcome = invoke_controller(deployment, environment)
        except ControlPlaneError:
            outcome = TERMINAL_REJECT
        if outcome in {HANDLED, TERMINAL_REJECT}:
            seen.add(identity)
            state["seen"] = sorted(seen, key=int)[-MAX_SEEN:]
            atomic_state(state)
        elif outcome == RETRYABLE:
            retryable_found = True
        else:
            retryable_found = True
    if not retryable_found and candidate_etag is not None:
        state["etags"][environment] = candidate_etag
        atomic_state(state)
    if retryable_found:
        fail("root deployment controller requires retry")


def validate_identity(config: HostConfig) -> None:
    current = pwd.getpwuid(os.geteuid())
    if current.pw_name != EXPECTED_USER or current.pw_shell not in {"/usr/sbin/nologin", "/bin/false"}:
        fail("deployment agent identity rejected")
    groups = os.getgroups()
    if len(groups) != 1 or groups[0] != current.pw_gid:
        fail("deployment agent supplementary groups rejected")
    if config.repository != "farhadesmaeili/YolPol":
        fail("deployment agent repository rejected")


def main() -> None:
    os.umask(0o077)
    if len(sys.argv) != 1:
        fail("arguments rejected")
    config = load_host_config(CONFIG_PATH)
    validate_identity(config)
    LOCK_PATH.touch(mode=0o600, exist_ok=True)
    with LOCK_PATH.open("r+b") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        state = load_state()
        now = int(time.time())
        if now < int(state["nextPollUnix"]):
            return
        client = GitHubAppClient(config)
        try:
            for environment in ("staging", "production"):
                poll_environment(client, state, environment)
            state["failures"] = 0
            state["nextPollUnix"] = now + 15
        except ControlPlaneError:
            state["failures"] = min(int(state["failures"]) + 1, 7)
            if int(state["nextPollUnix"]) <= now:
                state["nextPollUnix"] = now + retry_delay({}, int(state["failures"]))
            raise
        finally:
            atomic_state(state)


if __name__ == "__main__":
    try:
        main()
    except (ControlPlaneError, OSError, subprocess.SubprocessError):
        print("yolpol-deployment-agent: poll failed", file=sys.stderr)
        raise SystemExit(1)
