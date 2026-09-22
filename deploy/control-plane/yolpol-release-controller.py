#!/usr/bin/python3
"""Root-only authenticated release transaction controller for YOLPOL."""

from __future__ import annotations

import hashlib
import importlib.machinery
import importlib.util
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path
from types import ModuleType
from typing import Any, NoReturn

from yolpol_control_plane import (
    CAPABILITY_ALGORITHM,
    CONTROLLER_HANDLED_EXIT,
    CONTROLLER_RETRYABLE_EXIT,
    CONTROLLER_TERMINAL_REJECT_EXIT,
    ControlPlaneError,
    DEPLOYMENT_TASK,
    GitHubAppClient,
    HostConfig,
    HttpResponse,
    MAX_ENVELOPE_BYTES,
    RetryableControlPlaneError,
    TerminalControlPlaneError,
    default_transport,
    fail,
    load_host_config,
    parse_submission,
    require_actor,
    require_decimal,
    validate_deployment_object,
    validate_private_key_file,
    verify_oidc,
    b64url_decode,
)


CONFIG_PATH = Path("/etc/yolpol/control-plane/agent.json")
LEDGER_PATH = Path("/opt/yolpol/runtime/deployment-ledger.json")
JOURNAL_ROOT = Path("/opt/yolpol/runtime/deployment-journals")
INTERNAL = Path("/opt/yolpol/bin/yolpol-deploy-internal")
BOOTSTRAP = Path("/opt/yolpol/bin/yolpol-bootstrap")
POLICY = Path("/opt/yolpol/bin/yolpol-deploy-policy")
RUN_ROOT = Path("/run/yolpol-deployment")
MAX_TRANSACTION_SECONDS = 4_500
RELEASE_ASSET_LIMIT = 1_000_000
RELEASE_ASSETS = {"release-manifest.json", "release-manifest.sha256"}
SAFE_TOKEN = re.compile(rb"^[\x21-\x7e]{1,1024}$")
PHASE_C2_RESULT = "PHASE_C2_OFFSERVER_BACKUP_REQUIRED"
MANUAL_DATABASE_REVIEW_RESULT = "MANUAL_DATABASE_REVIEW_REQUIRED"
MANUAL_DEPLOYMENT_RECONCILIATION_RESULT = "MANUAL_DEPLOYMENT_RECONCILIATION_REQUIRED"
PRE_MUTATION_CRASH_RECONCILED_RESULT = "PRE_MUTATION_CRASH_RECONCILED"


def controller_fail(message: str) -> NoReturn:
    raise ControlPlaneError(message)


def load_python(path: Path, name: str) -> ModuleType:
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    specification = importlib.util.spec_from_loader(name, loader)
    if specification is None:
        controller_fail("host module loading failed")
    module = importlib.util.module_from_spec(specification)
    had_previous = name in sys.modules
    previous = sys.modules.get(name)
    sys.modules[name] = module
    try:
        loader.exec_module(module)
    except BaseException:
        if had_previous:
            sys.modules[name] = previous
        else:
            sys.modules.pop(name, None)
        raise
    return module


def read_stdin() -> bytes:
    value = sys.stdin.buffer.read(MAX_ENVELOPE_BYTES + 1)
    if not value or len(value) > MAX_ENVELOPE_BYTES:
        controller_fail("controller input rejected")
    return value


def require_root_and_lock() -> int:
    if os.geteuid() != 0:
        controller_fail("root controller identity rejected")
    try:
        target = os.readlink("/proc/self/fd/9")
        metadata = os.fstat(9)
    except OSError as error:
        raise ControlPlaneError("deployment lock is unavailable") from error
    if target != "/opt/yolpol/runtime/deployment.lock" or not stat.S_ISREG(metadata.st_mode):
        controller_fail("deployment lock ownership rejected")
    return 9


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    content = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            os.fchown(stream.fileno(), 0, 0)
            os.fchmod(stream.fileno(), 0o600)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def load_ledger() -> dict[str, Any]:
    if not LEDGER_PATH.exists():
        return {"schemaVersion": 1, "records": []}
    try:
        value = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ControlPlaneError("deployment ledger rejected") from error
    if not isinstance(value, dict) or set(value) != {"schemaVersion", "records"} or value["schemaVersion"] != 1 or not isinstance(value["records"], list):
        controller_fail("deployment ledger rejected")
    return value


def persist_ledger(ledger: dict[str, Any]) -> None:
    atomic_json(LEDGER_PATH, ledger)


def record_identity(deployment_id: str, envelope: Any, claims: dict[str, Any]) -> dict[str, Any]:
    intent = envelope.intent.value
    return {
        "deploymentId": deployment_id,
        "intentSha256": envelope.intent.digest,
        "jti": claims["jti"],
        "nonce": intent["nonce"],
        "workflowRunId": intent["workflowRunId"],
        "workflowRunAttempt": intent["workflowRunAttempt"],
        "environment": intent["environment"],
        "releaseTag": intent["releaseTag"],
        "gitSha": intent["gitSha"],
        "manifestSha256": intent["manifestSha256"],
    }


def begin_record(ledger: dict[str, Any], identity: dict[str, Any], current_manifest: dict[str, Any] | None) -> tuple[dict[str, Any], str]:
    identity_keys = {"deploymentId", "intentSha256", "jti", "nonce"}
    for record in ledger["records"]:
        if not isinstance(record, dict):
            controller_fail("deployment ledger record rejected")
        matching = {key for key in identity_keys if record.get(key) == identity[key]}
        if matching:
            if all(record.get(key) == value for key, value in identity.items()):
                return record, "replay"
            raise TerminalControlPlaneError("conflicting replay identity rejected")
    environment_records = [
        record for record in ledger["records"]
        if record.get("environment") == identity["environment"]
    ]
    manual_database_review = any(requires_manual_database_review(record) for record in environment_records)
    manual_deployment_reconciliation = any(
        requires_manual_deployment_reconciliation(record) for record in environment_records
    )
    target_records = [
        record for record in environment_records
        if record.get("manifestSha256") == identity["manifestSha256"]
    ]
    if not manual_database_review and not manual_deployment_reconciliation:
        for record in target_records:
            if record.get("localOutcome") == "success":
                return record, "already-successful"
    now = int(time.time())
    record = {
        **identity,
        "previousAuthoritySha256": None if current_manifest is None else current_manifest.get("sha256"),
        "currentMigrationFingerprint": None if current_manifest is None else current_manifest.get("migrationFingerprint"),
        "targetMigrationFingerprint": None,
        "migrationState": "never-started",
        "phase": "accepted",
        "localOutcome": "in-progress",
        "result": None,
        "statusSynchronization": "pending",
        "createdAtUnix": now,
        "updatedAtUnix": now,
    }
    mode = "new"
    if manual_database_review:
        record.update({
            "phase": "manual-review-blocked",
            "localOutcome": "failure",
            "result": MANUAL_DATABASE_REVIEW_RESULT,
        })
        mode = "manual-database-review"
    elif manual_deployment_reconciliation:
        record.update({
            "phase": "manual-reconciliation-blocked",
            "localOutcome": "failure",
            "result": MANUAL_DEPLOYMENT_RECONCILIATION_RESULT,
        })
        mode = "manual-deployment-reconciliation"
    ledger["records"].append(record)
    persist_ledger(ledger)
    return record, mode


def requires_manual_database_review(record: dict[str, Any]) -> bool:
    migration_state = record.get("migrationState")
    if migration_state not in {"never-started", "started", "completed", "failed"}:
        controller_fail("deployment ledger migration state rejected")
    return (
        migration_state in {"started", "failed"}
        or record.get("phase") == "manual-review"
        or record.get("result") == MANUAL_DATABASE_REVIEW_RESULT
    )


def requires_manual_deployment_reconciliation(record: dict[str, Any]) -> bool:
    return (
        record.get("localOutcome") == "in-progress"
        or record.get("phase") == "rollback-failed"
        or record.get("result") == MANUAL_DEPLOYMENT_RECONCILIATION_RESULT
    )


def reconcile_pre_mutation(
    ledger: dict[str, Any], environment: str, deployment_id: str, policy: ModuleType,
) -> dict[str, Any]:
    require_decimal(deployment_id, "deployment ID")
    if deployment_id == "0" or environment != "staging":
        controller_fail("pre-mutation reconciliation request rejected")

    records = ledger["records"]
    if any(not isinstance(record, dict) for record in records):
        controller_fail("deployment ledger record rejected")
    matching = [record for record in records if record.get("deploymentId") == deployment_id]
    if len(matching) != 1:
        controller_fail("pre-mutation reconciliation record rejected")
    record = matching[0]
    required = {
        "environment": environment,
        "localOutcome": "in-progress",
        "phase": "accepted",
        "migrationState": "never-started",
        "targetMigrationFingerprint": None,
        "result": None,
    }
    if any(key not in record or record[key] != value for key, value in required.items()):
        controller_fail("pre-mutation reconciliation state rejected")

    environment_records = [
        candidate for candidate in records
        if candidate is not record and candidate.get("environment") == environment
    ]
    if any(requires_manual_database_review(candidate) for candidate in environment_records):
        controller_fail("another database review blocker exists")
    if any(requires_manual_deployment_reconciliation(candidate) for candidate in environment_records):
        controller_fail("another deployment reconciliation blocker exists")

    current = current_authority(environment, policy)
    if current is None:
        controller_fail("current release authority is not provisioned")
    if current["sha256"] != record.get("previousAuthoritySha256"):
        controller_fail("pre-mutation reconciliation authority changed")
    if current["migrationFingerprint"] != record.get("currentMigrationFingerprint"):
        controller_fail("pre-mutation reconciliation migration fingerprint changed")

    journal = JOURNAL_ROOT / deployment_id
    if os.path.lexists(journal):
        controller_fail("pre-mutation reconciliation journal exists")

    transition(
        ledger,
        record,
        "reconciled-pre-mutation",
        localOutcome="failure",
        migrationState="never-started",
        result=PRE_MUTATION_CRASH_RECONCILED_RESULT,
    )
    return record


def transition(ledger: dict[str, Any], record: dict[str, Any], phase: str, **updates: Any) -> None:
    record["phase"] = phase
    record["updatedAtUnix"] = int(time.time())
    record.update(updates)
    persist_ledger(ledger)


def job_headers(token: bytes, *, accept: str = "application/vnd.github+json") -> dict[str, str]:
    try:
        text = token.decode("ascii", "strict")
    except UnicodeError as error:
        raise ControlPlaneError("job capability rejected") from error
    return {
        "Accept": accept,
        "Authorization": f"Bearer {text}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "yolpol-release-controller/1",
    }


def job_request(config: HostConfig, token: bytes, method: str, path: str, *, body: bytes | None = None, accept: str = "application/vnd.github+json") -> HttpResponse:
    if not path.startswith("/") or ".." in path or "//" in path:
        controller_fail("GitHub API path rejected")
    owner, repository = config.repository.split("/", 1)
    allowed_prefixes = (
        f"/repos/{owner}/{repository}/releases/",
        f"/repos/{owner}/{repository}/git/ref/tags/",
        f"/repos/{owner}/{repository}/git/tags/",
        f"/repos/{owner}/{repository}/deployments/",
    )
    if not any(path.startswith(prefix) for prefix in allowed_prefixes):
        controller_fail("GitHub API endpoint rejected")
    return default_transport(method, f"https://api.github.com{path}", job_headers(token, accept=accept), body)


def response_json(response: HttpResponse, label: str, status: int = 200) -> dict[str, Any]:
    if response.status != status or len(response.body) > RELEASE_ASSET_LIMIT:
        controller_fail(f"{label} request rejected")
    try:
        value = json.loads(response.body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ControlPlaneError(f"{label} response rejected") from error
    if not isinstance(value, dict):
        controller_fail(f"{label} response rejected")
    return value


def decrypt_capability(config: HostConfig, envelope: Any) -> bytes:
    intent = envelope.intent.value
    trust = config.environment(intent["environment"])
    capability = intent["capability"]
    if capability["keyId"] != trust.capability_key_id or capability["algorithm"] != CAPABILITY_ALGORITHM:
        controller_fail("capability key identity rejected")
    path = Path(trust.capability_private_key_file)
    validate_private_key_file(path)
    ciphertext = b64url_decode(capability["ciphertext"], label="capability ciphertext", maximum=8_192)
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        result = subprocess.run(
            [
                "/usr/bin/openssl", "pkeyutl", "-decrypt", "-inkey", f"/proc/self/fd/{descriptor}",
                "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256",
                "-pkeyopt", "rsa_mgf1_md:sha256",
            ],
            input=ciphertext,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            pass_fds=(descriptor,),
        )
    finally:
        os.close(descriptor)
    if result.returncode != 0 or SAFE_TOKEN.fullmatch(result.stdout) is None:
        controller_fail("capability decryption rejected")
    return result.stdout


def resolve_tag(config: HostConfig, token: bytes, tag: str) -> str:
    owner, repository = config.repository.split("/", 1)
    encoded = urllib.parse.quote(tag, safe="")
    value = response_json(job_request(config, token, "GET", f"/repos/{owner}/{repository}/git/ref/tags/{encoded}"), "tag reference")
    object_value = value.get("object")
    for _ in range(3):
        if not isinstance(object_value, dict) or object_value.get("type") not in {"commit", "tag"} or not isinstance(object_value.get("sha"), str):
            controller_fail("tag reference object rejected")
        if object_value["type"] == "commit":
            return str(object_value["sha"])
        tag_sha = str(object_value["sha"])
        value = response_json(job_request(config, token, "GET", f"/repos/{owner}/{repository}/git/tags/{tag_sha}"), "annotated tag")
        object_value = value.get("object")
    controller_fail("tag indirection depth rejected")


def authenticate_release(config: HostConfig, token: bytes, intent: dict[str, Any], policy: ModuleType) -> tuple[bytes, bytes, dict[str, Any]]:
    owner, repository = config.repository.split("/", 1)
    tag = str(intent["releaseTag"])
    encoded = urllib.parse.quote(tag, safe="")
    release = response_json(job_request(config, token, "GET", f"/repos/{owner}/{repository}/releases/tags/{encoded}"), "Release")
    if release.get("tag_name") != tag or release.get("draft") is not False or release.get("prerelease") is not False:
        controller_fail("Release state rejected")
    if resolve_tag(config, token, tag) != intent["gitSha"]:
        controller_fail("Release tag commit rejected")
    assets = release.get("assets")
    if not isinstance(assets, list) or len(assets) != 2:
        controller_fail("Release assets rejected")
    by_name: dict[str, dict[str, Any]] = {}
    for asset in assets:
        if not isinstance(asset, dict) or asset.get("name") not in RELEASE_ASSETS or asset.get("name") in by_name:
            controller_fail("Release asset identity rejected")
        size = asset.get("size")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or size > RELEASE_ASSET_LIMIT:
            controller_fail("Release asset size rejected")
        by_name[str(asset["name"])] = asset
    contents: dict[str, bytes] = {}
    for name in sorted(RELEASE_ASSETS):
        asset_id = by_name[name].get("id")
        if isinstance(asset_id, bool) or not isinstance(asset_id, int) or asset_id <= 0:
            controller_fail("Release asset ID rejected")
        response = job_request(config, token, "GET", f"/repos/{owner}/{repository}/releases/assets/{asset_id}", accept="application/octet-stream")
        if response.status != 200 or not response.body or len(response.body) > RELEASE_ASSET_LIMIT:
            controller_fail("Release asset download rejected")
        contents[name] = response.body
    try:
        checksum_text = contents["release-manifest.sha256"].decode("ascii", "strict")
        manifest = policy.validate_manifest_bytes(contents["release-manifest.json"], checksum_text)
    except Exception as error:
        raise ControlPlaneError("Release manifest rejected") from error
    if hashlib.sha256(contents["release-manifest.json"]).hexdigest() != intent["manifestSha256"]:
        controller_fail("Release manifest digest rejected")
    if manifest.get("tag") != tag or manifest.get("gitSha") != intent["gitSha"] or manifest.get("repository") != f"https://github.com/{config.repository}":
        controller_fail("Release manifest identity rejected")
    return contents["release-manifest.json"], contents["release-manifest.sha256"], manifest


def post_status(
    config: HostConfig, token: bytes, deployment_id: str, environment: str, state: str, description: str,
) -> None:
    if state not in {"in_progress", "success", "failure", "error"}:
        controller_fail("Deployment status state rejected")
    if environment not in {"staging", "production"}:
        controller_fail("Deployment status environment rejected")
    owner, repository = config.repository.split("/", 1)
    body = json.dumps({
        "state": state,
        "description": description[:140],
        "environment": environment,
        "auto_inactive": False,
    }, separators=(",", ":")).encode("utf-8")
    response = job_request(config, token, "POST", f"/repos/{owner}/{repository}/deployments/{deployment_id}/statuses", body=body)
    if response.status != 201:
        controller_fail("Deployment status publication failed")


def current_authority(environment: str, policy: ModuleType) -> dict[str, Any] | None:
    directory = Path(f"/opt/yolpol/releases/{environment}/active")
    manifest_path = directory / "release-manifest.json"
    checksum_path = directory / "release-manifest.sha256"
    if not manifest_path.exists() and not checksum_path.exists():
        return None
    try:
        manifest_bytes = manifest_path.read_bytes()
        checksum = checksum_path.read_text(encoding="ascii")
        manifest = policy.validate_manifest_bytes(manifest_bytes, checksum)
    except Exception as error:
        raise ControlPlaneError("current release authority rejected") from error
    return {
        "manifest": manifest,
        "manifestBytes": manifest_bytes,
        "checksumBytes": checksum.encode("ascii"),
        "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "migrationFingerprint": f"{manifest['database']['latestMigration']}:{manifest['database']['migrationSetSha256']}",
    }


def render_runtime(path: Path, replacements: dict[str, str], policy: ModuleType, environment: str, manifest: dict[str, Any]) -> bytes:
    try:
        text = path.read_text(encoding="ascii")
        expected = getattr(policy, f"{environment}_expected_keys")()
        current = policy.parse_runtime_environment_text(text, expected)
    except Exception as error:
        raise ControlPlaneError("current runtime contract rejected") from error
    if not set(replacements) <= set(current):
        controller_fail("runtime replacement contract rejected")
    current.update(replacements)
    content = "".join(f"{key}={current[key]}\n" for key in sorted(current)).encode("ascii")
    values = policy.parse_runtime_environment_text(content.decode("ascii"), expected)
    getattr(policy, f"validate_{environment}_runtime")(values, manifest)
    return content


def target_runtimes(environment: str, manifest: dict[str, Any], policy: ModuleType) -> dict[Path, bytes]:
    images = {image["role"]: image["immutableRef"] for image in manifest["images"]}
    prefix = "STAGING" if environment == "staging" else "PRODUCTION"
    replacements = {
        "YOLPOL_GIT_REVISION": manifest["gitSha"],
        "YOLPOL_WEB_IMAGE": images["web"],
        "YOLPOL_WORKER_IMAGE": images["worker"],
        "YOLPOL_MIGRATION_IMAGE": images["migration"],
        "YOLPOL_BACKUP_RESTORE_IMAGE": images["backup-restore"],
    }
    del prefix
    result = {
        Path(f"/opt/yolpol/{environment}/runtime.env"): render_runtime(
            Path(f"/opt/yolpol/{environment}/runtime.env"), replacements, policy, environment, manifest,
        ),
    }
    if environment == "staging":
        result[Path("/opt/yolpol/monitoring/runtime.env")] = render_runtime(
            Path("/opt/yolpol/monitoring/runtime.env"),
            {"YOLPOL_OPERATIONS_METRICS_IMAGE": images["operations-metrics"]},
            policy, "monitoring", manifest,
        )
    return result


def journal_snapshot(deployment_id: str, environment: str, current: dict[str, Any], runtime_paths: list[Path]) -> Path:
    journal = JOURNAL_ROOT / deployment_id
    if journal.exists():
        return journal
    journal.mkdir(mode=0o700)
    (journal / "environment").write_text(environment + "\n", encoding="ascii")
    (journal / "release-manifest.json").write_bytes(current["manifestBytes"])
    (journal / "release-manifest.sha256").write_bytes(current["checksumBytes"])
    for path in runtime_paths:
        (journal / ("monitoring-runtime.env" if "monitoring" in path.parts else "runtime.env")).write_bytes(path.read_bytes())
    for path in journal.iterdir():
        os.chown(path, 0, 0)
        os.chmod(path, 0o600)
        with path.open("rb") as stream:
            os.fsync(stream.fileno())
    directory = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return journal


def activate(bootstrap: ModuleType, environment: str, manifest_bytes: bytes, checksum_bytes: bytes, runtimes: dict[Path, bytes]) -> None:
    bootstrap.activate_release_pair(environment, manifest_bytes, checksum_bytes)
    for path, content in runtimes.items():
        bootstrap.atomic_write(path, content, 0, 0, 0o600, replace=True)


def restore_previous(bootstrap: ModuleType, environment: str, journal: Path) -> None:
    bootstrap.activate_release_pair(
        environment,
        (journal / "release-manifest.json").read_bytes(),
        (journal / "release-manifest.sha256").read_bytes(),
    )
    runtime_path = Path(f"/opt/yolpol/{environment}/runtime.env")
    bootstrap.atomic_write(runtime_path, (journal / "runtime.env").read_bytes(), 0, 0, 0o600, replace=True)
    monitoring = journal / "monitoring-runtime.env"
    if monitoring.exists():
        bootstrap.atomic_write(Path("/opt/yolpol/monitoring/runtime.env"), monitoring.read_bytes(), 0, 0, 0o600, replace=True)


def internal(action: str, *, docker_config: Path | None = None, deadline: float | None = None) -> bytes:
    allowed = {
        "validate-staging", "validate-production", "backup-create-verify-deep-staging",
        "pull-staging", "pull-production", "deploy-database-staging", "deploy-database-production",
        "migrate-staging", "deploy-app-staging", "deploy-app-production", "deploy-workers-staging",
        "deploy-workers-production", "deploy-operations-exporter", "health-staging", "health-production",
        "ingress-health-staging", "ingress-health-production", "public-smoke-staging",
    }
    if action not in allowed:
        controller_fail("internal action rejected")
    environment = {
        "PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LC_ALL": "C",
        "YOLPOL_INTERNAL_LOCK_FD": "9",
    }
    if docker_config is not None:
        environment["YOLPOL_DOCKER_CONFIG"] = str(docker_config)
    timeout = MAX_TRANSACTION_SECONDS
    if deadline is not None:
        timeout = max(1, min(MAX_TRANSACTION_SECONDS, int(deadline - time.monotonic())))
        if time.monotonic() >= deadline:
            controller_fail("deployment transaction deadline exceeded")
    try:
        result = subprocess.run(
            [str(INTERNAL), action], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            check=False, env=environment, pass_fds=(9,), timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ControlPlaneError(f"internal deployment operation failed: {action}") from error
    if result.returncode != 0:
        controller_fail(f"internal deployment operation failed: {action}")
    return result.stdout


def docker_auth(token: bytes, actor: str) -> tuple[Path, Path]:
    actor = require_actor(actor)
    RUN_ROOT.mkdir(mode=0o700, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="request-", dir=RUN_ROOT))
    os.chmod(root, 0o700)
    config = root / "docker"
    config.mkdir(mode=0o700)
    try:
        result = subprocess.run(
            ["/usr/bin/docker", "--config", str(config), "login", "ghcr.io", "--username", actor, "--password-stdin"],
            input=token, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as error:
        shutil.rmtree(root, ignore_errors=True)
        raise ControlPlaneError("temporary registry authentication failed") from error
    if result.returncode != 0:
        # Public packages remain supported through an empty, unauthenticated config.
        shutil.rmtree(config)
        config.mkdir(mode=0o700)
        (config / "config.json").write_text("{}\n", encoding="ascii")
        os.chmod(config / "config.json", 0o600)
    return root, config


def staging_success_exists(ledger: dict[str, Any], manifest_sha256: str) -> bool:
    return any(
        isinstance(record, dict) and record.get("environment") == "staging"
        and record.get("manifestSha256") == manifest_sha256 and record.get("localOutcome") == "success"
        for record in ledger["records"]
    )


def rollback_disposition(changed_fingerprint: bool, migration_state: str) -> str:
    if migration_state not in {"never-started", "started", "completed", "failed"}:
        controller_fail("migration state rejected")
    if changed_fingerprint and migration_state in {"started", "completed", "failed"}:
        return "manual-review"
    return "restore-previous"


def execute_transaction(
    config: HostConfig, deployment_id: str, envelope: Any, claims: dict[str, Any], token: bytes,
    ledger: dict[str, Any], record: dict[str, Any], mode: str,
) -> str:
    deadline = time.monotonic() + MAX_TRANSACTION_SECONDS

    def run(action: str, *, docker_config: Path | None = None) -> bytes:
        return internal(action, docker_config=docker_config, deadline=deadline)

    policy = load_python(POLICY, "yolpol_deploy_policy_controller")
    bootstrap = load_python(BOOTSTRAP, "yolpol_bootstrap_controller")
    environment = envelope.intent.environment
    intent = envelope.intent.value
    current = current_authority(environment, policy)
    if current is None:
        controller_fail("Production or Staging authority is not provisioned")
    manifest_bytes, checksum_bytes, target = authenticate_release(config, token, intent, policy)
    current_fingerprint = f"{current['manifest']['database']['latestMigration']}:{current['manifest']['database']['migrationSetSha256']}"
    target_fingerprint = f"{target['database']['latestMigration']}:{target['database']['migrationSetSha256']}"
    changed = current_fingerprint != target_fingerprint
    transition(
        ledger, record, "release-authenticated", currentMigrationFingerprint=current_fingerprint,
        targetMigrationFingerprint=target_fingerprint,
    )
    if environment == "production":
        run("validate-production")
        if not staging_success_exists(ledger, intent["manifestSha256"]):
            controller_fail("exact Release has not succeeded on Staging")
        if changed:
            transition(ledger, record, "phase-c2-required", localOutcome="failure", result=PHASE_C2_RESULT)
            controller_fail(PHASE_C2_RESULT)
    else:
        run("validate-staging")
        if changed:
            run("backup-create-verify-deep-staging")
            transition(ledger, record, "backup-verified")
    runtimes = target_runtimes(environment, target, policy)
    journal = journal_snapshot(deployment_id, environment, current, list(runtimes))
    authority_mutation_started = False
    request_root: Path | None = None
    docker_config: Path | None = None
    try:
        transition(ledger, record, "authority-changing")
        authority_mutation_started = True
        activate(bootstrap, environment, manifest_bytes, checksum_bytes, runtimes)
        transition(ledger, record, "authority-active")
        request_root, docker_config = docker_auth(token, str(claims["actor"]))
        run(f"pull-{environment}", docker_config=docker_config)
        transition(ledger, record, "images-pulled")
        run(f"deploy-database-{environment}", docker_config=docker_config)
        transition(ledger, record, "database-ready")
        if changed:
            transition(ledger, record, "migration-starting", migrationState="started")
            run("migrate-staging", docker_config=docker_config)
            transition(ledger, record, "migration-completed", migrationState="completed")
        run(f"deploy-app-{environment}", docker_config=docker_config)
        transition(ledger, record, "application-deployed")
        run(f"deploy-workers-{environment}", docker_config=docker_config)
        transition(ledger, record, "workers-deployed")
        if environment == "staging":
            run("deploy-operations-exporter", docker_config=docker_config)
            transition(ledger, record, "operations-exporter-deployed")
        run(f"health-{environment}", docker_config=docker_config)
        run(f"ingress-health-{environment}", docker_config=docker_config)
        if environment == "staging":
            run("public-smoke-staging", docker_config=docker_config)
        transition(ledger, record, "verified")
        return "deployed-not-publicly-activated" if environment == "production" else "deployed"
    except (ControlPlaneError, OSError, ValueError, TypeError, subprocess.SubprocessError) as error:
        if not authority_mutation_started:
            raise ControlPlaneError("deployment transaction failed") from error
        disposition = rollback_disposition(changed, str(record.get("migrationState")))
        if disposition == "manual-review":
            if record.get("migrationState") == "started":
                transition(ledger, record, "manual-review", migrationState="failed")
            raise ControlPlaneError("migration or post-migration deployment failed; manual review required") from error
        try:
            restore_previous(bootstrap, environment, journal)
            run(f"deploy-app-{environment}", docker_config=docker_config)
            run(f"deploy-workers-{environment}", docker_config=docker_config)
            if environment == "staging":
                run("deploy-operations-exporter", docker_config=docker_config)
            transition(ledger, record, "rolled-back")
        except Exception as rollback_error:
            transition(ledger, record, "rollback-failed", result="manual-review-required")
            raise ControlPlaneError("deployment and rollback failed") from rollback_error
        raise ControlPlaneError("deployment failed and previous runtime was restored") from error
    finally:
        if request_root is not None:
            shutil.rmtree(request_root, ignore_errors=True)


def main() -> None:
    os.umask(0o077)
    require_root_and_lock()
    if len(sys.argv) == 4 and sys.argv[1:3] == ["reconcile-pre-mutation", "staging"]:
        policy = load_python(POLICY, "yolpol_deploy_policy_reconciliation")
        reconcile_pre_mutation(load_ledger(), "staging", sys.argv[3], policy)
        return
    if len(sys.argv) != 3 or sys.argv[1] != "apply" or sys.argv[2] not in {"staging", "production"}:
        controller_fail("controller arguments rejected")
    environment = sys.argv[2]
    config = load_host_config(CONFIG_PATH)
    try:
        deployment_id, envelope = parse_submission(
            read_stdin(), expected_environment=environment, expected_repository=config.repository,
        )
        claims = verify_oidc(envelope, config)
    except RetryableControlPlaneError:
        raise
    except ControlPlaneError as error:
        raise TerminalControlPlaneError("deployment authorization rejected") from error
    app = GitHubAppClient(config)
    deployment = app.get_deployment(deployment_id)
    try:
        validate_deployment_object(deployment, deployment_id, envelope, config)
        token = decrypt_capability(config, envelope)
    except RetryableControlPlaneError:
        raise
    except ControlPlaneError as error:
        raise TerminalControlPlaneError("deployment authorization rejected") from error
    policy = load_python(POLICY, "yolpol_deploy_policy_initial")
    current = current_authority(environment, policy)
    ledger = load_ledger()
    identity = record_identity(deployment_id, envelope, claims)
    record, mode = begin_record(ledger, identity, current)
    if mode in {"already-successful", "replay"} and record.get("localOutcome") in {"success", "failure"}:
        state = "success" if record.get("localOutcome") == "success" else "failure"
        try:
            post_status(config, token, deployment_id, environment, state, str(record.get("result") or state))
            transition(ledger, record, record.get("phase", "terminal"), statusSynchronization="synced")
        except ControlPlaneError:
            transition(ledger, record, record.get("phase", "terminal"), statusSynchronization="pending")
            raise
        return
    if mode in {"manual-database-review", "manual-deployment-reconciliation"}:
        result = (
            MANUAL_DATABASE_REVIEW_RESULT
            if mode == "manual-database-review"
            else MANUAL_DEPLOYMENT_RECONCILIATION_RESULT
        )
        phase = "manual-review-blocked" if mode == "manual-database-review" else "manual-reconciliation-blocked"
        try:
            post_status(config, token, deployment_id, environment, "error", result)
            transition(ledger, record, phase, statusSynchronization="synced")
        except ControlPlaneError:
            transition(ledger, record, phase, statusSynchronization="pending")
            raise
        return
    if mode == "in-progress" or (mode == "replay" and record.get("localOutcome") == "in-progress"):
        controller_fail("deployment is already in progress or requires crash reconciliation")
    try:
        post_status(config, token, deployment_id, environment, "in_progress", f"{environment} deployment in progress")
        transition(ledger, record, record.get("phase", "accepted"), statusSynchronization="in-progress-synced")
    except ControlPlaneError:
        # Status publication is synchronization, not deployment authorization.
        transition(ledger, record, record.get("phase", "accepted"), statusSynchronization="pending")
    try:
        result = execute_transaction(config, deployment_id, envelope, claims, token, ledger, record, mode)
    except ControlPlaneError as error:
        if record.get("localOutcome") == "in-progress":
            transition(ledger, record, record.get("phase", "failed"), localOutcome="failure", result=str(error))
        try:
            post_status(config, token, deployment_id, environment, "failure", f"{environment} deployment failed")
            transition(ledger, record, record.get("phase", "failed"), statusSynchronization="synced")
        except ControlPlaneError:
            transition(ledger, record, record.get("phase", "failed"), statusSynchronization="pending")
            raise
        return
    transition(ledger, record, "completed", localOutcome="success", result=result)
    try:
        post_status(config, token, deployment_id, environment, "success", f"{environment}: {result}")
        transition(ledger, record, "completed", statusSynchronization="synced")
    except ControlPlaneError:
        transition(ledger, record, "completed", statusSynchronization="pending")
        raise


if __name__ == "__main__":
    try:
        main()
    except TerminalControlPlaneError:
        print("yolpol-release-controller: request rejected", file=sys.stderr)
        raise SystemExit(CONTROLLER_TERMINAL_REJECT_EXIT)
    except (ControlPlaneError, OSError, ValueError, TypeError, subprocess.SubprocessError):
        print("yolpol-release-controller: retry required", file=sys.stderr)
        raise SystemExit(CONTROLLER_RETRYABLE_EXIT)
    raise SystemExit(CONTROLLER_HANDLED_EXIT)
