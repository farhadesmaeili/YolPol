#!/usr/bin/python3
"""Root-only, fail-closed bootstrap for a supported YOLPOL host.

The normal deployment wrapper intentionally cannot perform these operations.
This program prepares host state and installs reviewed repository contracts; it
never starts application, ingress, monitoring, or Production services.
"""

from __future__ import annotations

import argparse
import ctypes
import fcntl
import grp
import importlib.machinery
import importlib.util
import json
import os
import platform
import pwd
import re
import stat
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, BinaryIO, NoReturn


HOST_ROOT = Path("/opt/yolpol")
BOOTSTRAP_LOCK = Path("/run/lock/yolpol-bootstrap.lock")
TRUSTED_SOURCE_ROOT = Path("/root/yolpol-bootstrap-source")
TRUSTED_SOURCE_SCRIPT = TRUSTED_SOURCE_ROOT / "deploy/bootstrap/yolpol-bootstrap.py"
SUPPORTED_OS_ID = "debian"
SUPPORTED_OS_VERSION = "12"
SUPPORTED_ARCHITECTURE = "x86_64"
OPERATOR_NAME = "yolpol-operator"
OPERATOR_UID = 1001
OPERATOR_GID = 1001
AGENT_NAME = "yolpol-deployment-agent"
AGENT_UID = 1002
AGENT_GID = 1002
CONTAINER_UID = 10001
CONTAINER_GID = 10001
COMPOSE_PATH = Path("/usr/libexec/docker/cli-plugins/docker-compose")
DOCKER_KEY_FINGERPRINT = "9DC858229FC7DD38854AE2D88D81803C0EBFCD88"
NETWORK_NAMES = ("yolpol-staging-ingress", "yolpol-production-ingress")
MAX_INPUT_BYTES = 1_000_000
PRIVILEGED_GROUP_NAMES = frozenset({"root", "sudo", "docker", "lxd", "libvirt", "libvirt-qemu"})
AT_FDCWD = -100
RENAME_EXCHANGE = 2


class BootstrapError(Exception):
    """An expected, safely reportable bootstrap rejection."""


class SafeArgumentParser(argparse.ArgumentParser):
    """Argparse variant that never reflects rejected argument bytes."""

    def error(self, message: str) -> NoReturn:
        del message
        self.print_usage(sys.stderr)
        self.exit(2, "yolpol-bootstrap: invalid arguments\n")


@dataclass(frozen=True)
class DirectoryContract:
    path: str
    uid: int
    gid: int
    mode: int


@dataclass(frozen=True)
class FileContract:
    source: str
    destination: str
    uid: int
    gid: int
    mode: int


DIRECTORIES = (
    DirectoryContract("/opt/yolpol", 0, 0, 0o755),
    DirectoryContract("/opt/yolpol/bin", 0, 0, 0o755),
    DirectoryContract("/opt/yolpol/incoming", OPERATOR_UID, OPERATOR_GID, 0o700),
    DirectoryContract("/opt/yolpol/releases", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/releases/staging", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/releases/staging/active", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/releases/production", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/releases/production/active", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/runtime", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/runtime/tmp", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/runtime/deployment-journals", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/staging", 0, 0, 0o750),
    DirectoryContract("/opt/yolpol/staging/secrets", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/staging/backups", CONTAINER_UID, CONTAINER_GID, 0o700),
    DirectoryContract("/opt/yolpol/production", 0, 0, 0o750),
    DirectoryContract("/opt/yolpol/production/secrets", 0, 0, 0o700),
    DirectoryContract("/opt/yolpol/production/backups", CONTAINER_UID, CONTAINER_GID, 0o700),
    DirectoryContract("/opt/yolpol/ingress", 0, 0, 0o750),
    DirectoryContract("/opt/yolpol/monitoring", 0, 0, 0o750),
    DirectoryContract("/opt/yolpol/monitoring/prometheus", 0, 0, 0o755),
    DirectoryContract("/opt/yolpol/monitoring/prometheus/rules", 0, 0, 0o755),
    DirectoryContract("/opt/yolpol/monitoring/alertmanager", 0, 0, 0o755),
    DirectoryContract("/opt/yolpol/monitoring/blackbox", 0, 0, 0o755),
    DirectoryContract("/opt/yolpol/monitoring/secrets", 0, 0, 0o700),
    DirectoryContract("/root/.docker", 0, 0, 0o700),
    DirectoryContract("/etc/yolpol", 0, 0, 0o755),
    DirectoryContract("/etc/yolpol/control-plane", 0, AGENT_GID, 0o750),
    DirectoryContract("/var/lib/yolpol-deployment-agent", AGENT_UID, AGENT_GID, 0o700),
)

STATE_FILES = (
    ("/opt/yolpol/runtime/deployment.lock", 0o600, b""),
    ("/opt/yolpol/runtime/deployment-audit.log", 0o600, b""),
    ("/opt/yolpol/runtime/deployment-operation.log", 0o600, b""),
    ("/opt/yolpol/runtime/last-backup-created-at", 0o600, b""),
    ("/opt/yolpol/runtime/production-last-backup-created-at", 0o600, b""),
    ("/opt/yolpol/runtime/deployment-ledger.json", 0o600, b'{"schemaVersion":1,"records":[]}\n'),
    ("/root/.docker/config.json", 0o600, b"{}\n"),
)

MANAGED_FILES = (
    FileContract("deploy/bootstrap/yolpol-bootstrap.py", "/opt/yolpol/bin/yolpol-bootstrap", 0, 0, 0o555),
    FileContract("deploy/operations/yolpol-deploy", "/opt/yolpol/bin/yolpol-deploy", 0, 0, 0o755),
    FileContract("deploy/operations/yolpol-deploy-policy.py", "/opt/yolpol/bin/yolpol-deploy-policy", 0, 0, 0o555),
    FileContract("deploy/operations/yolpol-deploy-internal", "/opt/yolpol/bin/yolpol-deploy-internal", 0, 0, 0o500),
    FileContract("deploy/control-plane/yolpol_control_plane.py", "/opt/yolpol/bin/yolpol_control_plane.py", 0, 0, 0o555),
    FileContract("deploy/control-plane/yolpol-deployment-agent.py", "/opt/yolpol/bin/yolpol-deployment-agent", 0, 0, 0o555),
    FileContract("deploy/control-plane/yolpol-release-controller.py", "/opt/yolpol/bin/yolpol-release-controller", 0, 0, 0o500),
    FileContract("deploy/control-plane/yolpol-deployment-agent.service", "/etc/systemd/system/yolpol-deployment-agent.service", 0, 0, 0o644),
    FileContract("deploy/control-plane/yolpol-deployment-agent.timer", "/etc/systemd/system/yolpol-deployment-agent.timer", 0, 0, 0o644),
    FileContract("deploy/control-plane/agent.json.example", "/etc/yolpol/control-plane/agent.json.example", 0, AGENT_GID, 0o440),
    FileContract("deploy/operations/logrotate.yolpol-deploy", "/etc/logrotate.d/yolpol-deploy", 0, 0, 0o644),
    FileContract("deploy/staging/compose.yaml", "/opt/yolpol/staging/compose.yaml", 0, 0, 0o644),
    FileContract("deploy/staging/Caddyfile", "/opt/yolpol/staging/Caddyfile", 0, 0, 0o644),
    FileContract("deploy/production/compose.yaml", "/opt/yolpol/production/compose.yaml", 0, 0, 0o644),
    FileContract("deploy/ingress/compose.yaml", "/opt/yolpol/ingress/compose.yaml", 0, 0, 0o644),
    FileContract("deploy/ingress/Caddyfile", "/opt/yolpol/ingress/Caddyfile", 0, 0, 0o644),
    FileContract("deploy/monitoring/compose.yaml", "/opt/yolpol/monitoring/compose.yaml", 0, 0, 0o644),
    FileContract("deploy/monitoring/prometheus/prometheus.yml", "/opt/yolpol/monitoring/prometheus/prometheus.yml", 0, 0, 0o644),
    FileContract("deploy/monitoring/prometheus/rules/yolpol-alerts.yml", "/opt/yolpol/monitoring/prometheus/rules/yolpol-alerts.yml", 0, 0, 0o644),
    FileContract("deploy/monitoring/alertmanager/alertmanager.local.yml", "/opt/yolpol/monitoring/alertmanager/alertmanager.local.yml", 0, 0, 0o644),
    FileContract("deploy/monitoring/alertmanager/alertmanager.telegram.yml", "/opt/yolpol/monitoring/alertmanager/alertmanager.telegram.yml", 0, 0, 0o644),
    FileContract("deploy/monitoring/blackbox/blackbox.yml", "/opt/yolpol/monitoring/blackbox/blackbox.yml", 0, 0, 0o644),
)

SUDOERS_SOURCE = "deploy/operations/sudoers.yolpol-deploy"
SUDOERS_DESTINATION = Path("/etc/sudoers.d/yolpol-deploy")
AGENT_SUDOERS_SOURCE = "deploy/control-plane/sudoers.yolpol-deployment-agent"
AGENT_SUDOERS_DESTINATION = Path("/etc/sudoers.d/yolpol-deployment-agent")
CONTROL_PLANE_CONFIG = Path("/etc/yolpol/control-plane/agent.json")
GITHUB_APP_PRIVATE_KEY = Path("/etc/yolpol/control-plane/github-app-private.pem")
STAGING_CAPABILITY_PRIVATE_KEY = Path("/etc/yolpol/control-plane/staging-capability-private.pem")
PRODUCTION_CAPABILITY_PRIVATE_KEY = Path("/etc/yolpol/control-plane/production-capability-private.pem")


@dataclass(frozen=True)
class SecretFile:
    filename: str
    uid: int
    gid: int
    mode: int
    keys: tuple[str, ...]
    environment_file: bool = False


APPLICATION_SECRETS = (
    SecretFile("postgres.env", 0, 0, 0o400, ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"), True),
    SecretFile("app-database.env", 0, 0, 0o400, ("APP_DATABASE_URL",), True),
    SecretFile("migration-database.env", 0, 0, 0o400, ("MIGRATION_DATABASE_URL",), True),
    SecretFile("backup-database.env", 0, 0, 0o400, ("BACKUP_DATABASE_URL",), True),
    SecretFile("telegram-bot-token", CONTAINER_UID, CONTAINER_GID, 0o400, ("TELEGRAM_BOT_TOKEN",)),
    SecretFile("telegram-webhook-secret", CONTAINER_UID, CONTAINER_GID, 0o400, ("TELEGRAM_WEBHOOK_SECRET",)),
    SecretFile("groq-api-key", CONTAINER_UID, CONTAINER_GID, 0o400, ("GROQ_API_KEY",)),
)

MONITORING_SECRETS = (
    SecretFile("alert-telegram-bot-token", 65534, 65534, 0o400, ("ALERT_TELEGRAM_BOT_TOKEN",)),
    SecretFile("alert-telegram-chat-id", 65534, 65534, 0o400, ("ALERT_TELEGRAM_CHAT_ID",)),
    SecretFile("staging-postgres-exporter-uri", 65534, 65534, 0o400, ("STAGING_POSTGRES_EXPORTER_URI",)),
    SecretFile("staging-postgres-exporter-user", 65534, 65534, 0o400, ("STAGING_POSTGRES_EXPORTER_USER",)),
    SecretFile("staging-postgres-exporter-password", 65534, 65534, 0o400, ("STAGING_POSTGRES_EXPORTER_PASSWORD",)),
    SecretFile("staging-operations-database-url", CONTAINER_UID, CONTAINER_GID, 0o400, ("STAGING_OPERATIONS_DATABASE_URL",)),
)


def fail(message: str) -> NoReturn:
    raise BootstrapError(message)


def run(command: list[str], *, input_bytes: bytes | None = None, capture: bool = False) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            command,
            input=input_bytes,
            check=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise BootstrapError(f"command failed: {Path(command[0]).name}") from error


def require_root() -> None:
    if os.geteuid() != 0:
        fail("must run as root")


def read_os_release() -> dict[str, str]:
    try:
        lines = Path("/etc/os-release").read_text(encoding="ascii").splitlines()
    except (OSError, UnicodeError) as error:
        raise BootstrapError("cannot read host operating-system identity") from error
    values: dict[str, str] = {}
    for line in lines:
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"')
    return values


def validate_supported_host() -> None:
    values = read_os_release()
    if values.get("ID") != SUPPORTED_OS_ID or values.get("VERSION_ID") != SUPPORTED_OS_VERSION:
        fail("unsupported host; Debian 12 is required")
    if platform.machine() != SUPPORTED_ARCHITECTURE:
        fail("unsupported architecture; x86_64 is required")


def command_exists(path: str | Path) -> bool:
    candidate = Path(path)
    return candidate.is_file() and os.access(candidate, os.X_OK)


def install_prerequisites() -> None:
    base = ["/usr/bin/python3", "/usr/bin/getfacl", "/usr/bin/curl", "/usr/bin/jq", "/usr/bin/openssl", "/usr/sbin/visudo"]
    if not all(command_exists(path) for path in base):
        run(["/usr/bin/apt-get", "update"])
        run([
            "/usr/bin/apt-get", "install", "--yes", "--no-install-recommends",
            "python3", "acl", "curl", "ca-certificates", "gnupg", "jq", "openssl", "sudo",
        ])
    if not command_exists("/usr/bin/docker") or not command_exists(COMPOSE_PATH):
        install_docker_packages()
    validate_prerequisites()


def install_docker_packages() -> None:
    keyring_directory = Path("/etc/apt/keyrings")
    keyring_directory.mkdir(mode=0o755, parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix="docker-key-", dir=keyring_directory, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        run([
            "/usr/bin/curl", "--proto", "=https", "--tlsv1.2", "--fail", "--silent", "--show-error",
            "--location", "https://download.docker.com/linux/debian/gpg", "--output", str(temporary_path),
        ])
        fingerprint = run(
            ["/usr/bin/gpg", "--batch", "--show-keys", "--with-colons", str(temporary_path)],
            capture=True,
        ).stdout.decode("ascii", "strict")
        if f"fpr:::::::::{DOCKER_KEY_FINGERPRINT}:" not in fingerprint:
            fail("Docker repository signing key fingerprint mismatch")
        keyring = keyring_directory / "docker.asc"
        atomic_write(keyring, temporary_path.read_bytes(), 0, 0, 0o644, replace=False)
    finally:
        temporary_path.unlink(missing_ok=True)
    source = (
        "Types: deb\n"
        "URIs: https://download.docker.com/linux/debian\n"
        "Suites: bookworm\n"
        "Components: stable\n"
        "Architectures: amd64\n"
        "Signed-By: /etc/apt/keyrings/docker.asc\n"
    ).encode("ascii")
    atomic_write(Path("/etc/apt/sources.list.d/docker.sources"), source, 0, 0, 0o644, replace=False)
    run(["/usr/bin/apt-get", "update"])
    run([
        "/usr/bin/apt-get", "install", "--yes", "--no-install-recommends",
        "docker-ce", "docker-ce-cli", "containerd.io", "docker-buildx-plugin", "docker-compose-plugin",
    ])
    if command_exists("/usr/bin/systemctl"):
        run(["/usr/bin/systemctl", "enable", "--now", "docker.service"])


def validate_prerequisites() -> None:
    for path in (
        "/usr/bin/python3", "/usr/bin/getfacl", "/usr/bin/curl", "/usr/bin/jq", "/usr/bin/openssl", "/usr/sbin/visudo",
        "/usr/bin/docker", COMPOSE_PATH,
    ):
        if not command_exists(path):
            fail(f"required executable is unavailable: {path}")
    run(["/usr/bin/docker", "version"], capture=True)
    run([str(COMPOSE_PATH), "version"], capture=True)


def ensure_operator() -> None:
    try:
        group = grp.getgrnam(OPERATOR_NAME)
    except KeyError:
        try:
            conflicting_group = grp.getgrgid(OPERATOR_GID)
        except KeyError:
            conflicting_group = None
        if conflicting_group is not None:
            fail("operator GID is already assigned")
        run(["/usr/sbin/groupadd", "--gid", str(OPERATOR_GID), OPERATOR_NAME])
        group = grp.getgrnam(OPERATOR_NAME)
    if group.gr_gid != OPERATOR_GID:
        fail("existing operator group is incompatible")
    try:
        user = pwd.getpwnam(OPERATOR_NAME)
    except KeyError:
        try:
            conflicting_user = pwd.getpwuid(OPERATOR_UID)
        except KeyError:
            conflicting_user = None
        if conflicting_user is not None:
            fail("operator UID is already assigned")
        run([
            "/usr/sbin/useradd", "--uid", str(OPERATOR_UID), "--gid", str(OPERATOR_GID),
            "--create-home", "--shell", "/bin/bash", OPERATOR_NAME,
        ])
        user = pwd.getpwnam(OPERATOR_NAME)
    if user.pw_uid != OPERATOR_UID or user.pw_gid != OPERATOR_GID or user.pw_shell not in {"/bin/bash", "/bin/sh"}:
        fail("existing operator account is incompatible")
    if CONTAINER_UID in {entry.pw_uid for entry in pwd.getpwall()}:
        fail("container UID 10001 must not identify a host user")
    if CONTAINER_GID in {entry.gr_gid for entry in grp.getgrall()}:
        fail("container GID 10001 must not identify a host group")
    group_ids = os.getgrouplist(OPERATOR_NAME, OPERATOR_GID)
    validate_operator_groups(group_ids)
    validate_docker_socket(group_ids)
    validate_agent_sudo(allow_missing=True)
    validate_operator_sudo(allow_missing=True)


def ensure_deployment_agent() -> None:
    try:
        group = grp.getgrnam(AGENT_NAME)
    except KeyError:
        try:
            conflicting_group = grp.getgrgid(AGENT_GID)
        except KeyError:
            conflicting_group = None
        if conflicting_group is not None:
            fail("deployment agent GID is already assigned")
        run(["/usr/sbin/groupadd", "--system", "--gid", str(AGENT_GID), AGENT_NAME])
        group = grp.getgrnam(AGENT_NAME)
    if group.gr_gid != AGENT_GID:
        fail("existing deployment agent group is incompatible")
    try:
        user = pwd.getpwnam(AGENT_NAME)
    except KeyError:
        try:
            conflicting_user = pwd.getpwuid(AGENT_UID)
        except KeyError:
            conflicting_user = None
        if conflicting_user is not None:
            fail("deployment agent UID is already assigned")
        run([
            "/usr/sbin/useradd", "--system", "--uid", str(AGENT_UID), "--gid", str(AGENT_GID),
            "--home-dir", "/nonexistent", "--no-create-home", "--shell", "/usr/sbin/nologin", AGENT_NAME,
        ])
        user = pwd.getpwnam(AGENT_NAME)
    if (
        user.pw_uid != AGENT_UID or user.pw_gid != AGENT_GID
        or user.pw_shell != "/usr/sbin/nologin" or user.pw_dir != "/nonexistent"
    ):
        fail("existing deployment agent account is incompatible")
    group_ids = os.getgrouplist(AGENT_NAME, AGENT_GID)
    if set(group_ids) != {AGENT_GID}:
        fail("deployment agent has supplementary group membership")
    names = {entry.gr_name for entry in grp.getgrall() if entry.gr_gid in set(group_ids)}
    if names & PRIVILEGED_GROUP_NAMES:
        fail("deployment agent has privileged group membership")
    validate_docker_socket(group_ids)
    validate_agent_sudo(allow_missing=True)


def validate_deployment_agent() -> None:
    try:
        user = pwd.getpwnam(AGENT_NAME)
        group = grp.getgrnam(AGENT_NAME)
    except KeyError as error:
        raise BootstrapError("deployment agent identity is missing") from error
    if (
        user.pw_uid != AGENT_UID or user.pw_gid != AGENT_GID or group.gr_gid != AGENT_GID
        or user.pw_shell != "/usr/sbin/nologin" or user.pw_dir != "/nonexistent"
    ):
        fail("deployment agent identity is incompatible")
    group_ids = os.getgrouplist(AGENT_NAME, AGENT_GID)
    if set(group_ids) != {AGENT_GID}:
        fail("deployment agent has supplementary group membership")
    validate_docker_socket(group_ids)
    validate_agent_sudo(allow_missing=False)


def validate_optional_control_plane_credentials() -> None:
    contracts = (
        (CONTROL_PLANE_CONFIG, 0, AGENT_GID, 0o440),
        (GITHUB_APP_PRIVATE_KEY, 0, AGENT_GID, 0o440),
        (STAGING_CAPABILITY_PRIVATE_KEY, 0, 0, 0o400),
        (PRODUCTION_CAPABILITY_PRIVATE_KEY, 0, 0, 0o400),
    )
    for path, uid, gid, mode in contracts:
        if not path.exists() and not path.is_symlink():
            continue
        check_metadata(path, uid, gid, mode, directory=False)
        if not path.is_file() or path.stat().st_size == 0:
            fail(f"control-plane credential/configuration is empty: {path}")


def validate_agent_sudo(*, allow_missing: bool) -> None:
    result = subprocess.run(
        ["/usr/bin/sudo", "-n", "-l", "-U", AGENT_NAME],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
    )
    if result.returncode != 0:
        if allow_missing:
            return
        fail("deployment agent sudo policy is unavailable")
    try:
        output = result.stdout.decode("utf-8", "strict")
    except UnicodeError as error:
        raise BootstrapError("deployment agent sudo policy output rejected") from error
    marker = "may run the following commands"
    marker_index = output.lower().find(marker)
    if marker_index < 0:
        if allow_missing and "not allowed to run sudo" in output.lower():
            return
        fail("deployment agent sudo policy cannot be proven")
    expected = {
        "/opt/yolpol/bin/yolpol-deploy apply-staging-intent",
        "/opt/yolpol/bin/yolpol-deploy apply-production-intent",
    }
    commands: set[str] = set()
    for line in (line.strip() for line in output[marker_index:].splitlines()[1:] if line.strip()):
        permitted = exact_agent_sudo_commands(line)
        if permitted is None:
            fail("deployment agent has broader sudo privilege")
        commands.update(permitted)
    if commands != expected:
        fail("deployment agent sudo policy is not exact")


def exact_agent_sudo_commands(rule: str) -> set[str] | None:
    run_as = re.fullmatch(r"\(([^()]*)\)\s+(.+)", rule)
    if run_as is None or run_as.group(1).strip() != "root":
        return None
    remainder = run_as.group(2)
    tags: list[str] = []
    while True:
        tag = re.match(r"^([A-Z][A-Z0-9_]*):\s*", remainder)
        if tag is None:
            break
        tags.append(tag.group(1))
        remainder = remainder[tag.end():]
    if len(tags) != 2 or set(tags) != {"NOPASSWD", "NOSETENV"}:
        return None
    commands: set[str] = set()
    for command in remainder.split(","):
        match = re.fullmatch(
            r"/opt/yolpol/bin/yolpol-deploy\s+(apply-staging-intent|apply-production-intent)",
            command.strip(),
        )
        if match is None:
            return None
        commands.add(f"/opt/yolpol/bin/yolpol-deploy {match.group(1)}")
    return commands or None


def validate_operator() -> None:
    try:
        user = pwd.getpwnam(OPERATOR_NAME)
        group = grp.getgrnam(OPERATOR_NAME)
    except KeyError as error:
        raise BootstrapError("operator identity is missing") from error
    if user.pw_uid != OPERATOR_UID or user.pw_gid != OPERATOR_GID or group.gr_gid != OPERATOR_GID:
        fail("operator identity is incompatible")
    if CONTAINER_UID in {entry.pw_uid for entry in pwd.getpwall()} or CONTAINER_GID in {entry.gr_gid for entry in grp.getgrall()}:
        fail("container identity is assigned on the host")
    group_ids = os.getgrouplist(OPERATOR_NAME, OPERATOR_GID)
    validate_operator_groups(group_ids)
    validate_docker_socket(group_ids)
    validate_operator_sudo(allow_missing=False)


def validate_operator_groups(group_ids: list[int]) -> None:
    unique_group_ids = set(group_ids)
    names = {entry.gr_name for entry in grp.getgrall() if entry.gr_gid in unique_group_ids}
    if names & PRIVILEGED_GROUP_NAMES:
        fail("operator has privileged group membership")
    if unique_group_ids != {OPERATOR_GID}:
        fail("operator has supplementary group membership")


def validate_operator_sudo(*, allow_missing: bool) -> None:
    result = subprocess.run(
        ["/usr/bin/sudo", "-n", "-l", "-U", OPERATOR_NAME],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
    )
    if result.returncode != 0:
        if allow_missing:
            return
        fail("operator sudo policy is unavailable")
    try:
        output = result.stdout.decode("utf-8", "strict")
    except UnicodeError as error:
        raise BootstrapError("operator sudo policy output rejected") from error
    marker = "may run the following commands"
    marker_index = output.lower().find(marker)
    if marker_index < 0:
        if allow_missing and "not allowed to run sudo" in output.lower():
            return
        fail("operator sudo policy cannot be proven")
    rules = [line.strip() for line in output[marker_index:].splitlines()[1:] if line.strip()]
    if len(rules) != 1 or not is_exact_operator_sudo_rule(rules[0]):
        fail("operator has broader sudo privilege")


def is_exact_operator_sudo_rule(rule: str) -> bool:
    run_as = re.fullmatch(r"\(([^()]*)\)\s+(.+)", rule)
    if run_as is None or run_as.group(1).strip() != "root":
        return False
    remainder = run_as.group(2)
    tags: list[str] = []
    while True:
        tag = re.match(r"^([A-Z][A-Z0-9_]*):\s*", remainder)
        if tag is None:
            break
        tags.append(tag.group(1))
        remainder = remainder[tag.end():]
    return (
        len(tags) == 2
        and set(tags) == {"NOPASSWD", "NOSETENV"}
        and remainder == "/opt/yolpol/bin/yolpol-deploy"
    )


def validate_docker_socket(operator_group_ids: list[int]) -> None:
    socket_path = Path("/var/run/docker.sock")
    try:
        metadata = socket_path.stat()
    except OSError as error:
        raise BootstrapError("Docker socket is unavailable") from error
    if not stat.S_ISSOCK(metadata.st_mode) or metadata.st_uid != 0:
        fail("Docker socket ownership contract failed")
    if stat.S_IMODE(metadata.st_mode) & 0o007:
        fail("Docker socket is world accessible")
    if metadata.st_gid in operator_group_ids:
        fail("operator has Docker socket group access")


def require_plain_ancestor(path: Path) -> None:
    current = path
    while current != current.parent:
        if current.exists():
            metadata = current.lstat()
            if stat.S_ISLNK(metadata.st_mode):
                fail("symlinked trusted path rejected")
            if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
                fail("writable or non-root trusted ancestor rejected")
        current = current.parent


def check_metadata(path: Path, uid: int, gid: int, mode: int, *, directory: bool) -> None:
    require_plain_ancestor(path.parent)
    try:
        metadata = path.lstat()
    except OSError as error:
        raise BootstrapError(f"required path is missing: {path}") from error
    expected_type = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected_type(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        fail(f"trusted path type mismatch: {path}")
    if (metadata.st_uid, metadata.st_gid, stat.S_IMODE(metadata.st_mode)) != (uid, gid, mode):
        fail(f"trusted path metadata mismatch: {path}")
    acl = run(["/usr/bin/getfacl", "-cp", "--", str(path)], capture=True).stdout.decode("utf-8", "strict")
    if re.search(r"^(?:user|group):[^:]+:|^mask::|^default:", acl, re.MULTILINE):
        fail(f"extended ACL rejected: {path}")


def ensure_directory(contract: DirectoryContract) -> None:
    path = Path(contract.path)
    require_plain_ancestor(path.parent)
    if path.exists() or path.is_symlink():
        check_metadata(path, contract.uid, contract.gid, contract.mode, directory=True)
        return
    path.mkdir()
    os.chown(path, contract.uid, contract.gid)
    os.chmod(path, contract.mode)


def atomic_write(path: Path, content: bytes, uid: int, gid: int, mode: int, *, replace: bool) -> bool:
    require_plain_ancestor(path.parent)
    if path.exists() or path.is_symlink():
        check_metadata(path, uid, gid, mode, directory=False)
        if path.read_bytes() == content:
            return False
        if not replace:
            fail(f"existing file differs; explicit replacement required: {path}")
    file_descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, "wb", closefd=True) as stream:
            stream.write(content)
            os.fchown(stream.fileno(), uid, gid)
            os.fchmod(stream.fileno(), mode)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        return True
    finally:
        temporary.unlink(missing_ok=True)


def ensure_state_files() -> None:
    for name, mode, initial in STATE_FILES:
        path = Path(name)
        if path.exists() or path.is_symlink():
            check_metadata(path, 0, 0, mode, directory=False)
            continue
        atomic_write(path, initial, 0, 0, mode, replace=False)


def has_unsafe_acl(path_or_fd: Path | int) -> bool:
    try:
        attributes = os.listxattr(path_or_fd, follow_symlinks=False) if isinstance(path_or_fd, Path) else os.listxattr(path_or_fd)
    except OSError as error:
        raise BootstrapError("trusted source ACL inspection failed") from error
    return "system.posix_acl_access" in attributes or "system.posix_acl_default" in attributes


def validate_source_directory(path: Path, *, exact_mode: int | None = None) -> None:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise BootstrapError("trusted bootstrap source is incomplete") from error
    mode = stat.S_IMODE(metadata.st_mode)
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        fail("trusted bootstrap source directory rejected")
    if metadata.st_uid != 0 or mode & 0o022 or (exact_mode is not None and mode != exact_mode):
        fail("trusted bootstrap source directory metadata rejected")
    if has_unsafe_acl(path):
        fail("trusted bootstrap source ACL rejected")


def trusted_source_root() -> Path:
    if Path(__file__).absolute() != TRUSTED_SOURCE_SCRIPT:
        fail("apply and refresh-contracts require the fixed trusted source command")
    validate_source_directory(Path("/"))
    validate_source_directory(Path("/root"), exact_mode=0o700)
    validate_source_directory(TRUSTED_SOURCE_ROOT, exact_mode=0o700)
    relative_script = TRUSTED_SOURCE_SCRIPT.relative_to(TRUSTED_SOURCE_ROOT)
    current = TRUSTED_SOURCE_ROOT
    for component in relative_script.parts[:-1]:
        current = current / component
        validate_source_directory(current)
    try:
        script_descriptor = os.open(
            TRUSTED_SOURCE_SCRIPT,
            os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK,
        )
    except OSError as error:
        raise BootstrapError("trusted bootstrap source is incomplete") from error
    try:
        script_metadata = os.fstat(script_descriptor)
        if (
            not stat.S_ISREG(script_metadata.st_mode)
            or script_metadata.st_uid != 0
            or stat.S_IMODE(script_metadata.st_mode) & 0o022
            or has_unsafe_acl(script_descriptor)
        ):
            fail("trusted bootstrap source command rejected")
    finally:
        os.close(script_descriptor)
    return TRUSTED_SOURCE_ROOT


def validate_source_file(relative_path: str) -> bytes:
    source_root = trusted_source_root()
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        fail("trusted bootstrap source path rejected")
    current = source_root
    for component in relative.parts[:-1]:
        current = current / component
        validate_source_directory(current)
    path = source_root / relative
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    try:
        file_descriptor = os.open(path, flags)
    except OSError as error:
        raise BootstrapError("trusted bootstrap source file rejected") from error
    try:
        metadata = os.fstat(file_descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
            fail("trusted bootstrap source file metadata rejected")
        if has_unsafe_acl(file_descriptor):
            fail("trusted bootstrap source file ACL rejected")
        with os.fdopen(file_descriptor, "rb", closefd=True) as stream:
            file_descriptor = -1
            content = stream.read(MAX_INPUT_BYTES + 1)
            if len(content) > MAX_INPUT_BYTES:
                fail("trusted bootstrap source file size rejected")
            return content
    finally:
        if file_descriptor >= 0:
            os.close(file_descriptor)


def load_managed_source_material() -> tuple[Path, list[tuple[FileContract, bytes]], bytes, bytes]:
    source_root = trusted_source_root()
    sudoers_content = validate_source_file(SUDOERS_SOURCE)
    agent_sudoers_content = validate_source_file(AGENT_SUDOERS_SOURCE)
    managed = [(contract, validate_source_file(contract.source)) for contract in MANAGED_FILES]
    return source_root, managed, sudoers_content, agent_sudoers_content


def preflight_managed_destination(
    path: Path,
    content: bytes,
    uid: int,
    gid: int,
    mode: int,
    *,
    replace: bool,
) -> None:
    require_plain_ancestor(path.parent)
    if not path.parent.is_dir() or path.parent.is_symlink():
        fail(f"managed destination parent rejected: {path.parent}")
    if not path.exists() and not path.is_symlink():
        return
    check_metadata(path, uid, gid, mode, directory=False)
    if path.read_bytes() != content and not replace:
        fail(f"existing file differs; explicit replacement required: {path}")


def install_managed_files(*, replace: bool) -> None:
    source_root, managed, sudoers_content, agent_sudoers_content = load_managed_source_material()
    run(["/usr/sbin/visudo", "-cf", str(source_root / SUDOERS_SOURCE)], capture=True)
    run(["/usr/sbin/visudo", "-cf", str(source_root / AGENT_SUDOERS_SOURCE)], capture=True)
    for contract, content in managed:
        preflight_managed_destination(
            Path(contract.destination), content, contract.uid, contract.gid, contract.mode, replace=replace,
        )
    preflight_managed_destination(SUDOERS_DESTINATION, sudoers_content, 0, 0, 0o440, replace=replace)
    preflight_managed_destination(AGENT_SUDOERS_DESTINATION, agent_sudoers_content, 0, 0, 0o440, replace=replace)
    for contract, content in managed:
        atomic_write(Path(contract.destination), content, contract.uid, contract.gid, contract.mode, replace=replace)
    atomic_write(SUDOERS_DESTINATION, sudoers_content, 0, 0, 0o440, replace=replace)
    atomic_write(AGENT_SUDOERS_DESTINATION, agent_sudoers_content, 0, 0, 0o440, replace=replace)
    run(["/usr/sbin/visudo", "-cf", str(SUDOERS_DESTINATION)], capture=True)
    run(["/usr/sbin/visudo", "-cf", str(AGENT_SUDOERS_DESTINATION)], capture=True)


def validate_all_source_material() -> None:
    load_managed_source_material()


def validate_managed_files() -> None:
    for contract in MANAGED_FILES:
        destination = Path(contract.destination)
        check_metadata(destination, contract.uid, contract.gid, contract.mode, directory=False)
    check_metadata(SUDOERS_DESTINATION, 0, 0, 0o440, directory=False)
    check_metadata(AGENT_SUDOERS_DESTINATION, 0, 0, 0o440, directory=False)
    run(["/usr/sbin/visudo", "-cf", str(SUDOERS_DESTINATION)], capture=True)
    run(["/usr/sbin/visudo", "-cf", str(AGENT_SUDOERS_DESTINATION)], capture=True)


def network_model(name: str) -> dict[str, Any] | None:
    result = subprocess.run(
        ["/usr/bin/docker", "network", "inspect", name],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode != 0:
        return None
    try:
        values = json.loads(result.stdout.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise BootstrapError("Docker network inspection failed") from error
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], dict):
        fail("Docker network inspection returned an invalid model")
    return values[0]


def validate_network(name: str, model: dict[str, Any]) -> None:
    if (
        model.get("Name") != name
        or model.get("Driver") != "bridge"
        or model.get("Scope") != "local"
        or model.get("Internal") is not False
        or model.get("Attachable") is not False
        or model.get("ConfigOnly") is not False
        or model.get("Options") != {}
    ):
        fail(f"incompatible existing Docker network: {name}")


def ensure_networks() -> None:
    for name in NETWORK_NAMES:
        model = network_model(name)
        if model is None:
            run(["/usr/bin/docker", "network", "create", "--driver", "bridge", name], capture=True)
            model = network_model(name)
            if model is None:
                fail(f"Docker network creation did not converge: {name}")
        validate_network(name, model)


def validate_networks() -> None:
    for name in NETWORK_NAMES:
        model = network_model(name)
        if model is None:
            fail(f"required Docker network is missing: {name}")
        validate_network(name, model)


def bootstrap_apply(*, replace_contracts: bool) -> None:
    validate_all_source_material()
    validate_supported_host()
    install_prerequisites()
    ensure_operator()
    ensure_deployment_agent()
    for contract in DIRECTORIES:
        ensure_directory(contract)
    ensure_state_files()
    install_managed_files(replace=replace_contracts)
    if command_exists("/usr/bin/systemctl"):
        run(["/usr/bin/systemctl", "daemon-reload"])
    validate_operator_sudo(allow_missing=False)
    validate_agent_sudo(allow_missing=False)
    validate_optional_control_plane_credentials()
    ensure_networks()


def bootstrap_check() -> None:
    validate_supported_host()
    validate_prerequisites()
    validate_operator()
    validate_deployment_agent()
    for contract in DIRECTORIES:
        check_metadata(Path(contract.path), contract.uid, contract.gid, contract.mode, directory=True)
    for name, mode, _ in STATE_FILES:
        check_metadata(Path(name), 0, 0, mode, directory=False)
    validate_managed_files()
    validate_optional_control_plane_credentials()
    validate_networks()


def validate_environment_contract(name: str) -> None:
    contracts = {
        "staging": (
            "/opt/yolpol/staging", "/opt/yolpol/staging/runtime.env", "/opt/yolpol/staging/compose.yaml",
            ("--profile", "legacy-staging-edge-migration", "--profile", "migration", "--profile", "backup", "--profile", "staff-operations", "--profile", "telegram-operations"),
        ),
        "production": (
            "/opt/yolpol/production", "/opt/yolpol/production/runtime.env", "/opt/yolpol/production/compose.yaml",
            ("--profile", "migration", "--profile", "backup", "--profile", "staff-operations", "--profile", "telegram-operations"),
        ),
        "ingress": ("/opt/yolpol/ingress", "/opt/yolpol/ingress/runtime.env", "/opt/yolpol/ingress/compose.yaml", ()),
        "monitoring": ("/opt/yolpol/monitoring", "/opt/yolpol/monitoring/runtime.env", "/opt/yolpol/monitoring/compose.yaml", ()),
    }
    try:
        directory, environment, compose_file, profiles = contracts[name]
    except KeyError as error:
        raise BootstrapError("readiness command rejected") from error
    policy = "/opt/yolpol/bin/yolpol-deploy-policy"
    run(["/usr/bin/python3", "-I", "-B", policy, f"validate-{name}"], capture=True)
    model = run(
        [
            "/usr/bin/env", "-i", "PATH=/usr/sbin:/usr/bin:/sbin:/bin", "HOME=/root",
            "DOCKER_CONFIG=/root/.docker", "TMPDIR=/opt/yolpol/runtime/tmp", "LC_ALL=C",
            str(COMPOSE_PATH), "--ansi", "never", "-p", f"yolpol-{name}",
            "--project-directory", directory, "--env-file", environment, "-f", compose_file,
            *profiles, "config", "--format", "json",
        ],
        capture=True,
    ).stdout
    run(["/usr/bin/python3", "-I", "-B", policy, f"validate-{name}-compose"], input_bytes=model, capture=True)


def bootstrap_check_environment(name: str) -> None:
    bootstrap_check()
    validate_environment_contract(name)


def load_policy() -> ModuleType:
    candidates = (
        Path("/opt/yolpol/bin/yolpol-deploy-policy"),
        Path(__file__).resolve().parents[1] / "operations/yolpol-deploy-policy.py",
    )
    policy_path = next((candidate for candidate in candidates if candidate.is_file()), None)
    if policy_path is None:
        fail("deployment policy is unavailable")
    specification = importlib.util.spec_from_file_location("yolpol_deploy_policy", policy_path)
    if specification is None or specification.loader is None:
        specification = importlib.util.spec_from_loader(
            "yolpol_deploy_policy",
            importlib.machinery.SourceFileLoader("yolpol_deploy_policy", str(policy_path)),
        )
    if specification is None or specification.loader is None:
        fail("deployment policy cannot be loaded")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def read_bounded(stream: BinaryIO) -> bytes:
    value = stream.read(MAX_INPUT_BYTES + 1)
    if not value or len(value) > MAX_INPUT_BYTES:
        fail("input size rejected")
    return value


def release_paths(environment: str) -> tuple[Path, Path]:
    if environment not in {"staging", "production"}:
        fail("release environment rejected")
    directory = HOST_ROOT / f"releases/{environment}/active"
    return directory / "release-manifest.json", directory / "release-manifest.sha256"


def fsync_directory(path: Path) -> None:
    directory_fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def exchange_directories(left: Path, right: Path) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        fail("atomic release-directory exchange is unavailable")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(
        AT_FDCWD,
        os.fsencode(left),
        AT_FDCWD,
        os.fsencode(right),
        RENAME_EXCHANGE,
    )
    if result != 0:
        error_number = ctypes.get_errno()
        raise BootstrapError("atomic release-directory exchange failed") from OSError(error_number, os.strerror(error_number))


def cleanup_staged_release(path: Path) -> None:
    if path.parent not in {HOST_ROOT / "releases/staging", HOST_ROOT / "releases/production"}:
        fail("staged release cleanup path rejected")
    if not path.name.startswith(".active-staged-"):
        fail("staged release cleanup name rejected")
    if not path.exists():
        return
    for filename in ("release-manifest.json", "release-manifest.sha256"):
        candidate = path / filename
        if candidate.exists() and not candidate.is_symlink():
            candidate.unlink()
    path.rmdir()


def activate_release_pair(environment: str, manifest: bytes, checksum_bytes: bytes) -> None:
    manifest_path, _ = release_paths(environment)
    active = manifest_path.parent
    release_directory = active.parent
    check_metadata(release_directory, 0, 0, 0o700, directory=True)
    check_metadata(active, 0, 0, 0o700, directory=True)
    staged = Path(tempfile.mkdtemp(prefix=".active-staged-", dir=release_directory))
    os.chown(staged, 0, 0)
    os.chmod(staged, 0o700)
    activated = False
    try:
        atomic_write(staged / "release-manifest.json", manifest, 0, 0, 0o600, replace=False)
        atomic_write(staged / "release-manifest.sha256", checksum_bytes, 0, 0, 0o600, replace=False)
        for filename in ("release-manifest.json", "release-manifest.sha256"):
            check_metadata(staged / filename, 0, 0, 0o600, directory=False)
        policy = load_policy()
        policy.validate_manifest_bytes(
            (staged / "release-manifest.json").read_bytes(),
            (staged / "release-manifest.sha256").read_text(encoding="ascii"),
        )
        fsync_directory(staged)
        active_entries = list(active.iterdir())
        if active_entries:
            if {entry.name for entry in active_entries} != {"release-manifest.json", "release-manifest.sha256"}:
                fail("existing release authority contents rejected")
            for filename in ("release-manifest.json", "release-manifest.sha256"):
                check_metadata(active / filename, 0, 0, 0o600, directory=False)
            policy.validate_manifest_bytes(
                (active / "release-manifest.json").read_bytes(),
                (active / "release-manifest.sha256").read_text(encoding="ascii"),
            )
        exchange_directories(staged, active)
        activated = True
        fsync_directory(release_directory)
        if active_entries:
            previous_sha = policy.validate_manifest_bytes(
                (staged / "release-manifest.json").read_bytes(),
                (staged / "release-manifest.sha256").read_text(encoding="ascii"),
            )["gitSha"]
            previous = release_directory / f"previous-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{previous_sha[:12]}"
            os.rename(staged, previous)
            fsync_directory(release_directory)
        else:
            staged.rmdir()
            fsync_directory(release_directory)
    finally:
        if not activated and staged.exists():
            cleanup_staged_release(staged)


def promote_release(environment: str) -> None:
    try:
        manifest_stream = os.fdopen(os.dup(3), "rb")
        checksum_stream = os.fdopen(os.dup(4), "rb")
    except OSError as error:
        raise BootstrapError("release promotion requires manifest on fd 3 and checksum on fd 4") from error
    with manifest_stream, checksum_stream:
        manifest = read_bounded(manifest_stream)
        checksum_bytes = read_bounded(checksum_stream)
    try:
        checksum = checksum_bytes.decode("ascii")
    except UnicodeError as error:
        raise BootstrapError("release input rejected") from error
    policy = load_policy()
    try:
        policy.validate_manifest_bytes(manifest, checksum)
    except Exception as error:
        raise BootstrapError("release input rejected") from error
    activate_release_pair(environment, manifest, checksum_bytes)


def runtime_destination(environment: str) -> Path:
    destinations = {
        "staging": HOST_ROOT / "staging/runtime.env",
        "production": HOST_ROOT / "production/runtime.env",
        "ingress": HOST_ROOT / "ingress/runtime.env",
        "monitoring": HOST_ROOT / "monitoring/runtime.env",
    }
    try:
        return destinations[environment]
    except KeyError as error:
        raise BootstrapError("runtime environment rejected") from error


def install_runtime(environment: str) -> None:
    content = read_bounded(sys.stdin.buffer)
    try:
        text = content.decode("ascii")
    except UnicodeError as error:
        raise BootstrapError("runtime input rejected") from error
    policy = load_policy()
    try:
        if environment == "staging":
            manifest_path, checksum_path = release_paths("staging")
            manifest = policy.validate_manifest_bytes(manifest_path.read_bytes(), checksum_path.read_text(encoding="ascii"))
            values = policy.parse_runtime_environment_text(text, policy.staging_expected_keys())
            policy.validate_staging_runtime(values, manifest)
        elif environment == "production":
            manifest_path, checksum_path = release_paths("production")
            manifest = policy.validate_manifest_bytes(manifest_path.read_bytes(), checksum_path.read_text(encoding="ascii"))
            values = policy.parse_runtime_environment_text(text, policy.production_expected_keys())
            policy.validate_production_runtime(values, manifest)
        elif environment == "monitoring":
            manifest_path, checksum_path = release_paths("staging")
            manifest = policy.validate_manifest_bytes(manifest_path.read_bytes(), checksum_path.read_text(encoding="ascii"))
            values = policy.parse_runtime_environment_text(text, policy.monitoring_expected_keys())
            policy.validate_monitoring_runtime(values, manifest)
        elif environment == "ingress":
            values = policy.parse_runtime_environment_text(text, policy.ingress_expected_keys())
            policy.validate_ingress_runtime(values)
        else:
            fail("runtime environment rejected")
    except BootstrapError:
        raise
    except Exception as error:
        raise BootstrapError("runtime input rejected") from error
    atomic_write(runtime_destination(environment), content, 0, 0, 0o600, replace=True)


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail("secret input rejected")
        result[key] = value
    return result


def parse_secret_payload(
    expected_environment: str,
    expected_keys: set[str],
    stream: BinaryIO | None = None,
) -> dict[str, str]:
    content = read_bounded(stream if stream is not None else sys.stdin.buffer)
    try:
        payload = json.loads(content.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError, BootstrapError) as error:
        raise BootstrapError("secret input rejected") from error
    if not isinstance(payload, dict) or set(payload) != {"schemaVersion", "environment", "secrets"}:
        fail("secret input rejected")
    if payload["schemaVersion"] != 1 or payload["environment"] != expected_environment:
        fail("secret input rejected")
    secrets = payload["secrets"]
    if not isinstance(secrets, dict) or set(secrets) != expected_keys:
        fail("secret input rejected")
    for value in secrets.values():
        if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 65_536:
            fail("secret input rejected")
        if any(ord(character) < 0x20 or ord(character) > 0x7E for character in value):
            fail("secret input rejected")
    return secrets


def render_secret_file(contract: SecretFile, values: dict[str, str]) -> bytes:
    if contract.environment_file:
        output: list[str] = []
        for input_key in contract.keys:
            if re.search(r"[\s$#\\'\"]", values[input_key]) is not None:
                fail("secret input rejected")
            output_key = {
                "APP_DATABASE_URL": "DATABASE_URL",
                "MIGRATION_DATABASE_URL": "DATABASE_URL",
                "BACKUP_DATABASE_URL": "DATABASE_URL",
            }.get(input_key, input_key)
            output.append(f"{output_key}={values[input_key]}")
        return ("\n".join(output) + "\n").encode("utf-8")
    return values[contract.keys[0]].encode("utf-8") + b"\n"


def secret_contracts(environment: str) -> tuple[Path, tuple[SecretFile, ...]]:
    if environment in {"staging", "production"}:
        return HOST_ROOT / environment / "secrets", APPLICATION_SECRETS
    if environment == "monitoring":
        return HOST_ROOT / "monitoring/secrets", MONITORING_SECRETS
    fail("secret environment rejected")


def install_secrets(environment: str, *, rotate: bool) -> None:
    directory, contracts = secret_contracts(environment)
    expected_keys = {key for contract in contracts for key in contract.keys}
    values = parse_secret_payload(environment, expected_keys)
    staged: list[tuple[Path, bytes, SecretFile]] = []
    for contract in contracts:
        destination = directory / contract.filename
        content = render_secret_file(contract, values)
        if destination.exists() or destination.is_symlink():
            check_metadata(destination, contract.uid, contract.gid, contract.mode, directory=False)
            if destination.read_bytes() == content:
                continue
            if not rotate:
                fail("existing secret differs; use the explicit rotation command")
        staged.append((destination, content, contract))
    for destination, content, contract in staged:
        atomic_write(destination, content, contract.uid, contract.gid, contract.mode, replace=rotate)


def acquire_bootstrap_lock() -> Any:
    if not BOOTSTRAP_LOCK.parent.is_dir() or BOOTSTRAP_LOCK.parent.is_symlink():
        fail("system lock directory is unavailable")
    flags = os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW
    try:
        file_descriptor = os.open(BOOTSTRAP_LOCK, flags | os.O_CREAT | os.O_EXCL, 0o600)
        os.fchown(file_descriptor, 0, 0)
    except FileExistsError:
        try:
            file_descriptor = os.open(BOOTSTRAP_LOCK, flags)
        except OSError as error:
            raise BootstrapError("bootstrap lock rejected") from error
    metadata = os.fstat(file_descriptor)
    if not stat.S_ISREG(metadata.st_mode) or (metadata.st_uid, metadata.st_gid, stat.S_IMODE(metadata.st_mode)) != (0, 0, 0o600):
        os.close(file_descriptor)
        fail("bootstrap lock metadata rejected")
    descriptor = os.fdopen(file_descriptor, "a+b")
    fcntl.flock(descriptor.fileno(), fcntl.LOCK_EX)
    return descriptor


def parse_arguments() -> argparse.Namespace:
    parser = SafeArgumentParser(prog="yolpol-bootstrap", allow_abbrev=False)
    subcommands = parser.add_subparsers(dest="command", required=True)
    for command in ("check", "check-staging", "check-production", "check-ingress", "check-monitoring"):
        subcommands.add_parser(command)
    subcommands.add_parser("apply")
    subcommands.add_parser("refresh-contracts")
    for command in ("runtime-install", "secret-install", "secret-rotate"):
        child = subcommands.add_parser(command)
        child.add_argument("environment", choices=("staging", "production", "ingress", "monitoring") if command == "runtime-install" else ("staging", "production", "monitoring"))
    for command in ("release-promote",):
        child = subcommands.add_parser(command)
        child.add_argument("environment", choices=("staging", "production"))
    return parser.parse_args()


def main() -> None:
    os.umask(0o077)
    arguments = parse_arguments()
    require_root()
    if arguments.command == "check":
        bootstrap_check()
        print("yolpol-bootstrap: foundation is ready")
        return
    readiness = {
        "check-staging": "staging",
        "check-production": "production",
        "check-ingress": "ingress",
        "check-monitoring": "monitoring",
    }
    if arguments.command in readiness:
        bootstrap_check_environment(readiness[arguments.command])
        print(f"yolpol-bootstrap: {readiness[arguments.command]} is ready")
        return
    if arguments.command in {"apply", "refresh-contracts"}:
        validate_all_source_material()
    with acquire_bootstrap_lock():
        if arguments.command == "apply":
            bootstrap_apply(replace_contracts=False)
        elif arguments.command == "refresh-contracts":
            bootstrap_apply(replace_contracts=True)
        elif arguments.command == "runtime-install":
            install_runtime(arguments.environment)
        elif arguments.command == "secret-install":
            install_secrets(arguments.environment, rotate=False)
        elif arguments.command == "secret-rotate":
            install_secrets(arguments.environment, rotate=True)
        elif arguments.command == "release-promote":
            promote_release(arguments.environment)
        else:
            fail("command rejected")
    print(f"yolpol-bootstrap: {arguments.command} completed")


if __name__ == "__main__":
    try:
        main()
    except (BootstrapError, OSError, ValueError, TypeError):
        print("yolpol-bootstrap: operation failed", file=sys.stderr)
        raise SystemExit(1)
