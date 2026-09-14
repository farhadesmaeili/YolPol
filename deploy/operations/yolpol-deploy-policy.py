#!/usr/bin/python3
"""Fail-closed deployment policy used by the root-owned YOLPOL wrapper."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

YOLPOL_ROOT = Path("/opt/yolpol")
STAGING_ENV = YOLPOL_ROOT / "staging/runtime.env"
MONITORING_ENV = YOLPOL_ROOT / "monitoring/runtime.env"
MANIFEST = YOLPOL_ROOT / "releases/active/release-manifest.json"
MANIFEST_CHECKSUM = YOLPOL_ROOT / "releases/active/release-manifest.sha256"

EXPECTED_SOURCE_REPOSITORY = "https://github.com/farhadesmaeili/YolPol"
EXPECTED_IMAGE_REPOSITORIES = {
    "web": "ghcr.io/farhadesmaeili/yolpol-web",
    "worker": "ghcr.io/farhadesmaeili/yolpol-worker",
    "migration": "ghcr.io/farhadesmaeili/yolpol-migration",
    "backup-restore": "ghcr.io/farhadesmaeili/yolpol-backup-restore",
    "operations-metrics": "ghcr.io/farhadesmaeili/yolpol-operations-metrics",
}
EXPECTED_DOCKER_TARGETS = {
    "web": "runtime",
    "worker": "worker-runtime",
    "migration": "migration-runtime",
    "backup-restore": "operations-runtime",
    "operations-metrics": "monitoring-runtime",
}

IMAGE_REFERENCE_PATTERN = re.compile(r"^ghcr\.io/farhadesmaeili/[a-z0-9._-]+@sha256:[0-9a-f]{64}$")
GIT_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SEMVER_PATTERN = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
MIGRATION_PATTERN = re.compile(r"^[0-9]{4}_[a-z0-9_]+$")
HEX_64_PATTERN = re.compile(r"^[0-9a-f]{64}$")
AGE_RECIPIENT_PATTERN = re.compile(r"^age1[0-9a-z]{58}$")
TELEGRAM_USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{5,32}$")

STAGING_FIXED_VALUES = {
    "YOLPOL_STAGING_POSTGRES_ENV_FILE": "/opt/yolpol/staging/secrets/postgres.env",
    "YOLPOL_STAGING_DATABASE_ENV_FILE": "/opt/yolpol/staging/secrets/app-database.env",
    "YOLPOL_STAGING_MIGRATION_ENV_FILE": "/opt/yolpol/staging/secrets/migration-database.env",
    "YOLPOL_STAGING_TELEGRAM_BOT_TOKEN_FILE": "/opt/yolpol/staging/secrets/telegram-bot-token",
    "YOLPOL_STAGING_TELEGRAM_WEBHOOK_SECRET_FILE": "/opt/yolpol/staging/secrets/telegram-webhook-secret",
    "YOLPOL_STAGING_GROQ_API_KEY_FILE": "/opt/yolpol/staging/secrets/groq-api-key",
    "YOLPOL_STAGING_BACKUP_DIRECTORY": "/opt/yolpol/staging/backups",
    "YOLPOL_STAGING_BACKUP_DATABASE_ENV_FILE": "/opt/yolpol/staging/secrets/backup-database.env",
    "YOLPOL_STAGING_RESTORE_DATABASE_ENV_FILE": "/opt/yolpol/staging/secrets/restore-database.env",
    "YOLPOL_STAGING_BACKUP_AGE_IDENTITY_FILE": "/opt/yolpol/staging/secrets/backup-age-identity",
    "YOLPOL_STAGING_BACKUP_RETENTION_COUNT": "14",
    "YOLPOL_STAGING_BIND_ADDRESS": "0.0.0.0",
    "YOLPOL_STAGING_HTTP_PORT": "80",
    "YOLPOL_STAGING_HTTPS_PORT": "443",
    "YOLPOL_STAGING_POSTGRES_MEMORY_LIMIT": "1g",
    "YOLPOL_STAGING_POSTGRES_CPU_LIMIT": "0.75",
    "YOLPOL_STAGING_WEB_MEMORY_LIMIT": "768m",
    "YOLPOL_STAGING_WEB_CPU_LIMIT": "0.75",
    "YOLPOL_STAGING_WORKER_MEMORY_LIMIT": "384m",
    "YOLPOL_STAGING_WORKER_CPU_LIMIT": "0.25",
    "YOLPOL_STAGING_CADDY_MEMORY_LIMIT": "256m",
    "YOLPOL_STAGING_CADDY_CPU_LIMIT": "0.20",
    "YOLPOL_STAGING_MIGRATION_MEMORY_LIMIT": "512m",
    "YOLPOL_STAGING_MIGRATION_CPU_LIMIT": "0.50",
    "YOLPOL_STAGING_OPERATIONS_MEMORY_LIMIT": "512m",
    "YOLPOL_STAGING_OPERATIONS_CPU_LIMIT": "0.50",
    "YOLPOL_STAGING_LOG_MAX_SIZE": "10m",
    "YOLPOL_STAGING_LOG_MAX_FILES": "3",
    "YOLPOL_STAGING_WORKER_STOP_GRACE_PERIOD": "90s",
    "YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN": "https://staging.yolpol.com",
}

MONITORING_FIXED_VALUES = {
    "YOLPOL_MONITORING_BIND_ADDRESS": "127.0.0.1",
    "YOLPOL_PROMETHEUS_PORT": "9090",
    "YOLPOL_ALERTMANAGER_PORT": "9093",
    "YOLPOL_PROMETHEUS_RETENTION_TIME": "15d",
    "YOLPOL_PROMETHEUS_RETENTION_SIZE": "2GB",
    "YOLPOL_ALERTMANAGER_RETENTION": "120h",
    "YOLPOL_MONITORING_TELEGRAM_BOT_TOKEN_FILE": "/opt/yolpol/monitoring/secrets/alert-telegram-bot-token",
    "YOLPOL_MONITORING_TELEGRAM_CHAT_ID_FILE": "/opt/yolpol/monitoring/secrets/alert-telegram-chat-id",
    "YOLPOL_MONITORING_STAGING_EDGE_NETWORK": "yolpol-staging_edge",
    "YOLPOL_MONITORING_STAGING_BACKEND_NETWORK": "yolpol-staging_backend",
    "YOLPOL_MONITORING_STAGING_POSTGRES_URI_FILE": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-uri",
    "YOLPOL_MONITORING_STAGING_POSTGRES_USER_FILE": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-user",
    "YOLPOL_MONITORING_STAGING_POSTGRES_PASSWORD_FILE": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-password",
    "YOLPOL_MONITORING_STAGING_OPERATIONS_DATABASE_URL_FILE": "/opt/yolpol/monitoring/secrets/staging-operations-database-url",
    "YOLPOL_MONITORING_STAGING_BACKUP_ENABLED": "false",
    "YOLPOL_MONITORING_STAGING_BACKUP_DIRECTORY": "/opt/yolpol/staging/backups",
    "YOLPOL_MONITORING_BACKUP_SCAN_INTERVAL_MS": "300000",
    "YOLPOL_MONITORING_LOG_MAX_SIZE": "10m",
    "YOLPOL_MONITORING_LOG_MAX_FILES": "3",
    "YOLPOL_PROMETHEUS_MEMORY_LIMIT": "512m",
    "YOLPOL_PROMETHEUS_CPU_LIMIT": "0.50",
    "YOLPOL_ALERTMANAGER_MEMORY_LIMIT": "128m",
    "YOLPOL_ALERTMANAGER_CPU_LIMIT": "0.15",
    "YOLPOL_NODE_EXPORTER_MEMORY_LIMIT": "128m",
    "YOLPOL_NODE_EXPORTER_CPU_LIMIT": "0.15",
    "YOLPOL_CADVISOR_MEMORY_LIMIT": "256m",
    "YOLPOL_CADVISOR_CPU_LIMIT": "0.30",
    "YOLPOL_POSTGRES_EXPORTER_MEMORY_LIMIT": "128m",
    "YOLPOL_POSTGRES_EXPORTER_CPU_LIMIT": "0.15",
    "YOLPOL_BLACKBOX_EXPORTER_MEMORY_LIMIT": "128m",
    "YOLPOL_BLACKBOX_EXPORTER_CPU_LIMIT": "0.10",
    "YOLPOL_OPERATIONS_EXPORTER_MEMORY_LIMIT": "128m",
    "YOLPOL_OPERATIONS_EXPORTER_CPU_LIMIT": "0.15",
}

ALERTMANAGER_CONFIGS = {
    "/opt/yolpol/monitoring/alertmanager/alertmanager.local.yml",
    "/opt/yolpol/monitoring/alertmanager/alertmanager.telegram.yml",
}

STAGING_SERVICES = {
    "edge",
    "web",
    "postgres",
    "inquiry-notifications",
    "conversation-translation",
    "conversation-ai-fallback",
    "staff-provision",
    "staff-bootstrap-super-admin",
    "telegram-webhook-set",
    "telegram-webhook-info",
    "migrate",
    "backup-create",
    "backup-verify",
    "backup-deep-verify",
    "backup-retention",
}
MONITORING_SERVICES = {
    "prometheus",
    "alertmanager",
    "node-exporter",
    "cadvisor",
    "postgres-exporter",
    "blackbox-exporter",
    "operations-exporter",
}

ALLOWED_SERVICE_KEYS = {
    "build",
    "cap_drop",
    "command",
    "cpus",
    "depends_on",
    "entrypoint",
    "environment",
    "healthcheck",
    "image",
    "logging",
    "mem_limit",
    "networks",
    "network_mode",
    "pid",
    "pids_limit",
    "ports",
    "profiles",
    "read_only",
    "restart",
    "secrets",
    "security_opt",
    "stop_grace_period",
    "stdin_open",
    "tmpfs",
    "tty",
    "user",
    "volumes",
}

STAGING_UPSTREAM_IMAGES = {
    "edge": "caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d",
    "postgres": "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94",
}
MONITORING_UPSTREAM_IMAGES = {
    "prometheus": "quay.io/prometheus/prometheus:v3.14.0@sha256:5ce7540c3c00ef4ab0c9d2c995c6a5b9c421f44b4a115d97a2c7af3b1c21cbb0",
    "alertmanager": "quay.io/prometheus/alertmanager:v0.32.1@sha256:51a825c2a40acc3e338fdd00d622e01ec090f72be2b3ea46be0839cd47a4d286",
    "node-exporter": "quay.io/prometheus/node-exporter:v1.12.1@sha256:1b4e4438faca4dd7e001dd445d161a4a2091b0fededa84093b3a8dfeae1f1be0",
    "cadvisor": "ghcr.io/google/cadvisor:v0.60.5@sha256:763aecf1c32c2be8a1a75f9abfc2fc461005c9dbbaa39cb356b354aac1296dbe",
    "postgres-exporter": "quay.io/prometheuscommunity/postgres-exporter:v0.20.1@sha256:ac5ec343104fae0e2d84a27bb8d69b38430a11910c5382cad85d478d2bab713e",
    "blackbox-exporter": "quay.io/prometheus/blackbox-exporter:v0.28.0@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc",
}


class PolicyError(Exception):
    """Expected fail-closed policy rejection."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise PolicyError(message)


def exact_keys(value: dict[str, Any], expected: set[str], field: str) -> None:
    require(set(value) == expected, f"{field} keys")


def no_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def parse_runtime_environment_text(text: str, expected_keys: set[str]) -> dict[str, str]:
    require("\r" not in text, "runtime environment carriage return")
    require(all(character == "\n" or 0x20 <= ord(character) <= 0x7E for character in text), "runtime environment character")
    values: dict[str, str] = {}
    for line in text.split("\n"):
        if line == "" or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=([^\s]*)", line)
        require(match is not None, "runtime environment line")
        key, value = match.groups()
        require(not key.startswith("COMPOSE_"), "Compose control variable")
        require(not key.startswith("DOCKER_"), "Docker control variable")
        require(key in expected_keys, "unknown runtime environment key")
        require(key not in values, "duplicate runtime environment key")
        require(value != "", "empty runtime environment value")
        require(re.fullmatch(r"[A-Za-z0-9._:/@+-]+", value) is not None, "runtime environment value")
        values[key] = value
    exact_keys(values, expected_keys, "runtime environment")
    return values


def parse_runtime_environment(path: Path, expected_keys: set[str]) -> dict[str, str]:
    try:
        text = path.read_text(encoding="ascii")
    except (OSError, UnicodeError) as error:
        raise PolicyError("runtime environment read") from error
    return parse_runtime_environment_text(text, expected_keys)


def parse_secret_environment(path: Path, expected_keys: set[str]) -> dict[str, str]:
    try:
        text = path.read_text(encoding="ascii")
    except (OSError, UnicodeError) as error:
        raise PolicyError("secret environment read") from error
    require("\r" not in text, "secret environment carriage return")
    require(all(character == "\n" or 0x20 <= ord(character) <= 0x7E for character in text), "secret environment character")
    values: dict[str, str] = {}
    for line in text.split("\n"):
        if line == "" or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.+)", line)
        require(match is not None, "secret environment line")
        key, value = match.groups()
        require(key in expected_keys, "unknown secret environment key")
        require(key not in values, "duplicate secret environment key")
        require(value != "", "empty secret environment value")
        values[key] = value
    exact_keys(values, expected_keys, "secret environment")
    return values


def validate_manifest_bytes(manifest_bytes: bytes, checksum_text: str) -> dict[str, Any]:
    require(0 < len(manifest_bytes) <= 1_000_000, "manifest size")
    require(len(checksum_text) <= 256, "manifest checksum size")
    require(re.fullmatch(r"[0-9a-f]{64}  release-manifest\.json\n?", checksum_text) is not None, "manifest checksum format")
    expected_checksum = checksum_text[:64]
    require(hashlib.sha256(manifest_bytes).hexdigest() == expected_checksum, "manifest checksum")
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"), object_pairs_hook=no_duplicate_json_keys)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise PolicyError("manifest JSON") from error
    require(isinstance(manifest, dict), "manifest object")
    exact_keys(manifest, {"manifestVersion", "version", "tag", "gitSha", "repository", "platform", "database", "images"}, "manifest")
    require(manifest["manifestVersion"] == 1, "manifest version")
    require(isinstance(manifest["version"], str) and SEMVER_PATTERN.fullmatch(manifest["version"]) is not None, "manifest version value")
    require(manifest["tag"] == f"v{manifest['version']}", "manifest tag")
    require(isinstance(manifest["gitSha"], str) and GIT_SHA_PATTERN.fullmatch(manifest["gitSha"]) is not None, "manifest revision")
    require(manifest["repository"] == EXPECTED_SOURCE_REPOSITORY, "manifest source repository")
    require(manifest["platform"] == "linux/amd64", "manifest platform")
    database = manifest["database"]
    require(isinstance(database, dict), "manifest database")
    exact_keys(database, {"latestMigration", "migrationSetSha256"}, "manifest database")
    require(isinstance(database["latestMigration"], str) and MIGRATION_PATTERN.fullmatch(database["latestMigration"]) is not None, "manifest migration")
    require(isinstance(database["migrationSetSha256"], str) and HEX_64_PATTERN.fullmatch(database["migrationSetSha256"]) is not None, "manifest migration digest")
    images = manifest["images"]
    require(isinstance(images, list) and len(images) == 5, "manifest images")
    by_role: dict[str, dict[str, Any]] = {}
    for image in images:
        require(isinstance(image, dict), "manifest image")
        exact_keys(image, {"role", "dockerTarget", "repository", "shaTag", "semverTag", "digest", "immutableRef"}, "manifest image")
        role = image["role"]
        require(isinstance(role, str) and role in EXPECTED_IMAGE_REPOSITORIES and role not in by_role, "manifest image role")
        repository = EXPECTED_IMAGE_REPOSITORIES[role]
        require(image["repository"] == repository, "manifest image repository")
        require(image["dockerTarget"] == EXPECTED_DOCKER_TARGETS[role], "manifest Docker target")
        require(image["shaTag"] == f"sha-{manifest['gitSha']}", "manifest SHA tag")
        require(image["semverTag"] == manifest["tag"], "manifest SemVer tag")
        require(isinstance(image["digest"], str) and re.fullmatch(r"sha256:[0-9a-f]{64}", image["digest"]) is not None, "manifest image digest")
        require(image["immutableRef"] == f"{repository}@{image['digest']}", "manifest immutable reference")
        by_role[role] = image
    exact_keys(by_role, set(EXPECTED_IMAGE_REPOSITORIES), "manifest image roles")
    manifest["imagesByRole"] = by_role
    return manifest


def load_release_manifest() -> dict[str, Any]:
    try:
        manifest_bytes = MANIFEST.read_bytes()
        checksum_text = MANIFEST_CHECKSUM.read_text(encoding="ascii")
    except (OSError, UnicodeError) as error:
        raise PolicyError("manifest read") from error
    return validate_manifest_bytes(manifest_bytes, checksum_text)


def staging_expected_keys() -> set[str]:
    return set(STAGING_FIXED_VALUES) | {
        "YOLPOL_GIT_REVISION",
        "YOLPOL_WEB_IMAGE",
        "YOLPOL_WORKER_IMAGE",
        "YOLPOL_MIGRATION_IMAGE",
        "YOLPOL_BACKUP_RESTORE_IMAGE",
        "YOLPOL_STAGING_BACKUP_AGE_RECIPIENT",
        "YOLPOL_STAGING_TELEGRAM_BOT_USERNAME",
    }


def monitoring_expected_keys() -> set[str]:
    return set(MONITORING_FIXED_VALUES) | {"YOLPOL_OPERATIONS_METRICS_IMAGE", "YOLPOL_ALERTMANAGER_CONFIG_FILE"}


def validate_staging_runtime(values: dict[str, str], manifest: dict[str, Any]) -> None:
    for key, expected in STAGING_FIXED_VALUES.items():
        require(values[key] == expected, "staging fixed runtime value")
    require(values["YOLPOL_GIT_REVISION"] == manifest["gitSha"], "staging revision")
    image_keys = {
        "YOLPOL_WEB_IMAGE": "web",
        "YOLPOL_WORKER_IMAGE": "worker",
        "YOLPOL_MIGRATION_IMAGE": "migration",
        "YOLPOL_BACKUP_RESTORE_IMAGE": "backup-restore",
    }
    for key, role in image_keys.items():
        value = values[key]
        require(IMAGE_REFERENCE_PATTERN.fullmatch(value) is not None, "staging image reference")
        require(value == manifest["imagesByRole"][role]["immutableRef"], "staging manifest image")
    require(AGE_RECIPIENT_PATTERN.fullmatch(values["YOLPOL_STAGING_BACKUP_AGE_RECIPIENT"]) is not None, "backup age recipient")
    require(TELEGRAM_USERNAME_PATTERN.fullmatch(values["YOLPOL_STAGING_TELEGRAM_BOT_USERNAME"]) is not None, "Telegram username")


def validate_monitoring_runtime(values: dict[str, str], manifest: dict[str, Any]) -> None:
    for key, expected in MONITORING_FIXED_VALUES.items():
        require(values[key] == expected, "monitoring fixed runtime value")
    require(values["YOLPOL_ALERTMANAGER_CONFIG_FILE"] in ALERTMANAGER_CONFIGS, "Alertmanager config")
    image = values["YOLPOL_OPERATIONS_METRICS_IMAGE"]
    require(IMAGE_REFERENCE_PATTERN.fullmatch(image) is not None, "monitoring image reference")
    require(image == manifest["imagesByRole"]["operations-metrics"]["immutableRef"], "monitoring manifest image")


def load_staging_contract() -> tuple[dict[str, str], dict[str, Any], dict[str, dict[str, str]]]:
    manifest = load_release_manifest()
    values = parse_runtime_environment(STAGING_ENV, staging_expected_keys())
    validate_staging_runtime(values, manifest)
    secret_environments = {
        "postgres": parse_secret_environment(YOLPOL_ROOT / "staging/secrets/postgres.env", {"POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"})
    }
    for filename in ("app-database.env", "migration-database.env", "backup-database.env"):
        secret_environments[filename] = parse_secret_environment(YOLPOL_ROOT / f"staging/secrets/{filename}", {"DATABASE_URL"})
    return values, manifest, secret_environments


def load_monitoring_contract() -> tuple[dict[str, str], dict[str, Any]]:
    manifest = load_release_manifest()
    values = parse_runtime_environment(MONITORING_ENV, monitoring_expected_keys())
    validate_monitoring_runtime(values, manifest)
    return values, manifest


def parse_compose_json(stream: str) -> dict[str, Any]:
    require(len(stream) <= 4_000_000, "Compose model size")
    try:
        model = json.loads(stream, object_pairs_hook=no_duplicate_json_keys)
    except json.JSONDecodeError as error:
        raise PolicyError("Compose model JSON") from error
    require(isinstance(model, dict), "Compose model object")
    return model


def service_map(model: dict[str, Any], expected: set[str]) -> dict[str, dict[str, Any]]:
    services = model.get("services")
    require(isinstance(services, dict), "Compose services")
    exact_keys(services, expected, "Compose services")
    require(all(isinstance(service, dict) for service in services.values()), "Compose service object")
    return services


def string_set(value: Any, field: str) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, dict):
        require(all(isinstance(key, str) and item is None for key, item in value.items()), field)
        return set(value)
    require(isinstance(value, list) and all(isinstance(item, str) for item in value), field)
    return set(value)


def validate_generic_service_security(name: str, service: dict[str, Any], allowed_host_pid: bool = False) -> None:
    require(set(service).issubset(ALLOWED_SERVICE_KEYS), f"{name} service keys")
    require(service.get("privileged") in (None, False), f"{name} privileged")
    require(not service.get("devices"), f"{name} devices")
    require(not service.get("cap_add"), f"{name} capabilities")
    require(service.get("ipc") is None, f"{name} IPC")
    require(service.get("network_mode") in (None, "none"), f"{name} network mode")
    require(service.get("pid") == ("host" if allowed_host_pid else None), f"{name} PID namespace")
    require(not service.get("group_add"), f"{name} groups")
    require(not service.get("device_cgroup_rules"), f"{name} device rules")
    require(not service.get("volumes_from"), f"{name} inherited volumes")
    require(not service.get("configs"), f"{name} configs")
    require(not service.get("sysctls"), f"{name} sysctls")
    require(service.get("userns_mode") != "host", f"{name} host user namespace")
    require(service.get("uts") != "host", f"{name} host UTS namespace")
    require(service.get("cgroup") != "host", f"{name} host cgroup namespace")


def validate_service_hardening(
    service: dict[str, Any],
    *,
    read_only: bool,
    user: str | None = None,
    tmpfs: set[str] | None = None,
) -> None:
    actual_read_only = service.get("read_only", False)
    require(isinstance(actual_read_only, bool) and actual_read_only is read_only, "Compose read-only root filesystem")
    require(service.get("user") == user, "Compose service user")
    require(string_set(service.get("cap_drop"), "Compose dropped capabilities") == ({"ALL"} if read_only else set()), "Compose dropped capabilities")
    require(string_set(service.get("security_opt"), "Compose security options") == ({"no-new-privileges:true"} if read_only else set()), "Compose security options")
    require(string_set(service.get("tmpfs"), "Compose tmpfs") == (tmpfs or set()), "Compose tmpfs")
    logging = service.get("logging")
    require(isinstance(logging, dict), "Compose logging")
    require(logging == {"driver": "json-file", "options": {"max-file": "3", "max-size": "10m"}}, "Compose logging policy")


def validate_environment(service: dict[str, Any], expected: dict[str, str]) -> None:
    environment = service.get("environment", {})
    require(isinstance(environment, dict), "Compose environment")
    require(environment == expected, "Compose environment values")


def validate_resources(
    service: dict[str, Any],
    *,
    memory_bytes: str,
    cpus: float,
    pids: int,
    restart: str,
) -> None:
    require(service.get("mem_limit") == memory_bytes, "Compose memory limit")
    require(service.get("cpus") == cpus, "Compose CPU limit")
    require(service.get("pids_limit") == pids, "Compose PID limit")
    require(service.get("restart") == restart, "Compose restart policy")


def normalized_mounts(service: dict[str, Any]) -> set[tuple[str, str, str, bool]]:
    result: set[tuple[str, str, str, bool]] = set()
    volumes = service.get("volumes", [])
    require(isinstance(volumes, list), "Compose volumes")
    for volume in volumes:
        require(isinstance(volume, dict), "Compose volume")
        require(set(volume).issubset({"type", "source", "target", "read_only", "bind", "volume"}), "Compose volume options")
        kind = volume.get("type")
        source = volume.get("source")
        target = volume.get("target")
        read_only = volume.get("read_only", False)
        require(isinstance(read_only, bool), "Compose volume read-only field")
        require(isinstance(kind, str) and isinstance(source, str) and isinstance(target, str), "Compose volume fields")
        bind_options = volume.get("bind", {})
        volume_options = volume.get("volume", {})
        require(isinstance(bind_options, dict), "Compose bind options")
        require(isinstance(volume_options, dict) and volume_options == {}, "Compose named-volume options")
        if kind == "bind":
            require(set(bind_options).issubset({"create_host_path", "propagation"}), "Compose bind options")
            create_host_path = bind_options.get("create_host_path")
            require(create_host_path is None or create_host_path is False, "Compose bind host-path creation")
            propagation = bind_options.get("propagation")
            require(
                propagation is None or (source, target, propagation) == ("/", "/host/root", "rslave"),
                "Compose bind propagation",
            )
        else:
            require(bind_options == {}, "Compose non-bind options")
        result.add((kind, source, target, read_only))
    require(len(result) == len(volumes), "duplicate Compose volume")
    return result


def normalized_secrets(service: dict[str, Any]) -> set[tuple[str, str]]:
    result: set[tuple[str, str]] = set()
    secrets = service.get("secrets", [])
    require(isinstance(secrets, list), "Compose service secrets")
    for secret in secrets:
        require(isinstance(secret, dict), "Compose service secret")
        exact_keys(secret, {"source", "target"}, "Compose service secret")
        source = secret.get("source")
        target = secret.get("target")
        require(isinstance(source, str) and isinstance(target, str), "Compose service secret fields")
        result.add((source, target))
    require(len(result) == len(secrets), "duplicate Compose service secret")
    return result


def validate_exact_top_level_resources(model: dict[str, Any], expected_networks: dict[str, tuple[str, bool, bool]], expected_volumes: dict[str, str], expected_secrets: dict[str, str]) -> None:
    networks = model.get("networks", {})
    volumes = model.get("volumes", {})
    secrets = model.get("secrets", {})
    require(isinstance(networks, dict) and isinstance(volumes, dict) and isinstance(secrets, dict), "Compose resources")
    exact_keys(networks, set(expected_networks), "Compose networks")
    exact_keys(volumes, set(expected_volumes), "Compose volumes")
    exact_keys(secrets, set(expected_secrets), "Compose secrets")
    for key, (name, internal, external) in expected_networks.items():
        network = networks[key]
        require(isinstance(network, dict), "Compose network")
        require(set(network).issubset({"name", "internal", "external", "ipam"}), "Compose network fields")
        require(network.get("ipam", {}) == {}, "Compose network IPAM")
        require(network.get("name") == name, "Compose network name")
        require(network.get("internal", False) is internal, "Compose internal network")
        require(network.get("external", False) is external, "Compose external network")
    for key, name in expected_volumes.items():
        volume = volumes[key]
        require(isinstance(volume, dict) and volume.get("name") == name, "Compose named volume")
        require(set(volume).issubset({"name", "external"}), "Compose volume fields")
        require(not volume.get("external", False), "Compose external volume")
    for key, path in expected_secrets.items():
        secret = secrets[key]
        require(isinstance(secret, dict) and secret.get("file") == path, "Compose secret path")
        require(set(secret).issubset({"name", "file"}), "Compose secret fields")
        require(secret.get("name") == f"{model.get('name')}_{key}", "Compose secret name")


def validate_ports(service: dict[str, Any], expected: set[tuple[str, int, str, str]]) -> None:
    actual: set[tuple[str, int, str, str]] = set()
    ports = service.get("ports", [])
    require(isinstance(ports, list), "Compose ports")
    for port in ports:
        require(isinstance(port, dict), "Compose port")
        exact_keys(port, {"mode", "host_ip", "target", "published", "protocol"}, "Compose port")
        host_ip = port.get("host_ip")
        target = port.get("target")
        published = port.get("published")
        protocol = port.get("protocol", "tcp")
        require(port.get("mode") == "ingress", "Compose port mode")
        require(isinstance(host_ip, str) and isinstance(target, int) and isinstance(published, str) and isinstance(protocol, str), "Compose port fields")
        actual.add((host_ip, target, published, protocol))
    require(actual == expected and len(actual) == len(ports), "Compose published ports")


def validate_command(service: dict[str, Any], expected: list[str] | None) -> None:
    require(service.get("entrypoint") is None, "Compose entrypoint")
    require(service.get("command") == expected, "Compose command")


def validate_profiles(service: dict[str, Any], expected: set[str]) -> None:
    require(string_set(service.get("profiles"), "Compose profiles") == expected, "Compose profile")


def validate_no_build(service: dict[str, Any]) -> None:
    require("build" not in service, "unexpected Compose build")


def validate_staging_compose_model(
    model: dict[str, Any],
    runtime: dict[str, str],
    secret_environments: dict[str, dict[str, str]],
) -> None:
    exact_keys(model, {"name", "networks", "secrets", "services", "volumes", "x-application-environment", "x-backup-operation", "x-json-logging", "x-staff-operation", "x-telegram-operation"}, "Staging Compose model")
    require(model.get("name") == "yolpol-staging", "Staging project name")
    services = service_map(model, STAGING_SERVICES)
    images = {
        **STAGING_UPSTREAM_IMAGES,
        "web": runtime["YOLPOL_WEB_IMAGE"],
        "inquiry-notifications": runtime["YOLPOL_WORKER_IMAGE"],
        "conversation-translation": runtime["YOLPOL_WORKER_IMAGE"],
        "conversation-ai-fallback": runtime["YOLPOL_WORKER_IMAGE"],
        "staff-provision": runtime["YOLPOL_WORKER_IMAGE"],
        "staff-bootstrap-super-admin": runtime["YOLPOL_WORKER_IMAGE"],
        "telegram-webhook-set": runtime["YOLPOL_WORKER_IMAGE"],
        "telegram-webhook-info": runtime["YOLPOL_WORKER_IMAGE"],
        "migrate": runtime["YOLPOL_MIGRATION_IMAGE"],
        "backup-create": runtime["YOLPOL_BACKUP_RESTORE_IMAGE"],
        "backup-verify": runtime["YOLPOL_BACKUP_RESTORE_IMAGE"],
        "backup-deep-verify": runtime["YOLPOL_BACKUP_RESTORE_IMAGE"],
        "backup-retention": runtime["YOLPOL_BACKUP_RESTORE_IMAGE"],
    }
    commands = {
        "edge": None,
        "web": None,
        "postgres": None,
        "inquiry-notifications": ["node", "--conditions=react-server", "--import", "tsx", "tooling/workers/inquiry-notifications.ts"],
        "conversation-translation": ["node", "--conditions=react-server", "--import", "tsx", "tooling/workers/conversation-translation.ts"],
        "conversation-ai-fallback": ["node", "--conditions=react-server", "--import", "tsx", "tooling/workers/conversation-ai-fallback.ts"],
        "staff-provision": ["node", "--conditions=react-server", "--import", "tsx", "tooling/staff-provisioning/index.ts"],
        "staff-bootstrap-super-admin": ["node", "--conditions=react-server", "--import", "tsx", "tooling/staff-provisioning/bootstrap-super-admin.ts"],
        "telegram-webhook-set": ["node", "--conditions=react-server", "--import", "tsx", "tooling/telegram/set-telegram-webhook.ts"],
        "telegram-webhook-info": ["node", "--conditions=react-server", "--import", "tsx", "tooling/telegram/get-telegram-webhook-info.ts"],
        "migrate": None,
        "backup-create": ["create"],
        "backup-verify": ["help"],
        "backup-deep-verify": ["help"],
        "backup-retention": ["prune"],
    }
    networks = {
        "edge": {"edge"},
        "web": {"edge", "backend"},
        "postgres": {"backend"},
        "inquiry-notifications": {"backend", "provider_egress"},
        "conversation-translation": {"backend", "provider_egress"},
        "conversation-ai-fallback": {"backend", "provider_egress"},
        "staff-provision": {"backend"},
        "staff-bootstrap-super-admin": {"backend"},
        "telegram-webhook-set": {"provider_egress"},
        "telegram-webhook-info": {"provider_egress"},
        "migrate": {"backend"},
        "backup-create": {"backend"},
        "backup-verify": set(),
        "backup-deep-verify": set(),
        "backup-retention": set(),
    }
    mounts = {
        "edge": {
            ("bind", "/opt/yolpol/staging/Caddyfile", "/etc/caddy/Caddyfile", True),
            ("volume", "caddy_data", "/data", False),
            ("volume", "caddy_config", "/config", False),
        },
        "postgres": {("volume", "postgres_data", "/var/lib/postgresql/data", False)},
        "backup-create": {("bind", "/opt/yolpol/staging/backups", "/backups", False)},
        "backup-verify": {("bind", "/opt/yolpol/staging/backups", "/backups", True)},
        "backup-deep-verify": {("bind", "/opt/yolpol/staging/backups", "/backups", True)},
        "backup-retention": {("bind", "/opt/yolpol/staging/backups", "/backups", False)},
    }
    secrets = {
        "web": {("telegram_bot_token", "/run/secrets/telegram_bot_token"), ("telegram_webhook_secret", "/run/secrets/telegram_webhook_secret")},
        "inquiry-notifications": {("telegram_bot_token", "/run/secrets/telegram_bot_token")},
        "conversation-translation": {("groq_api_key", "/run/secrets/groq_api_key")},
        "conversation-ai-fallback": {("groq_api_key", "/run/secrets/groq_api_key")},
        "telegram-webhook-set": {("telegram_bot_token", "/run/secrets/telegram_bot_token"), ("telegram_webhook_secret", "/run/secrets/telegram_webhook_secret")},
        "telegram-webhook-info": {("telegram_bot_token", "/run/secrets/telegram_bot_token")},
        "backup-deep-verify": {("backup_age_identity", "/run/secrets/backup_age_identity")},
    }
    application_environment = {
        "NODE_ENV": "production",
        "YOLPOL_DEPLOYMENT_ENVIRONMENT": "staging",
        "YOLPOL_APP_ORIGIN": "https://staging.yolpol.com",
        "YOLPOL_GIT_REVISION": runtime["YOLPOL_GIT_REVISION"],
        "YOLPOL_LOG_LEVEL": "info",
    }
    database_url = secret_environments["app-database.env"]["DATABASE_URL"]
    environments = {
        "edge": {},
        "web": {
            **application_environment,
            "DATABASE_URL": database_url,
            "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME": runtime["YOLPOL_STAGING_TELEGRAM_BOT_USERNAME"],
            "TELEGRAM_BOT_TOKEN_FILE": "/run/secrets/telegram_bot_token",
            "TELEGRAM_WEBHOOK_SECRET_FILE": "/run/secrets/telegram_webhook_secret",
        },
        "postgres": secret_environments["postgres"],
        "inquiry-notifications": {
            **application_environment,
            "DATABASE_URL": database_url,
            "INQUIRY_NOTIFICATION_WORKER_POLL_MS": "2000",
            "TELEGRAM_BOT_TOKEN_FILE": "/run/secrets/telegram_bot_token",
        },
        "conversation-translation": {
            **application_environment,
            "DATABASE_URL": database_url,
            "CONVERSATION_TRANSLATION_WORKER_POLL_MS": "2000",
            "GROQ_API_KEY_FILE": "/run/secrets/groq_api_key",
            "YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED": "false",
        },
        "conversation-ai-fallback": {
            **application_environment,
            "DATABASE_URL": database_url,
            "CONVERSATION_AI_FALLBACK_WORKER_POLL_MS": "2000",
            "GROQ_API_KEY_FILE": "/run/secrets/groq_api_key",
            "YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED": "false",
        },
        "staff-provision": {"DATABASE_URL": database_url},
        "staff-bootstrap-super-admin": {"DATABASE_URL": database_url},
        "telegram-webhook-set": {
            "TELEGRAM_BOT_TOKEN_FILE": "/run/secrets/telegram_bot_token",
            "TELEGRAM_WEBHOOK_PUBLIC_ORIGIN": runtime["YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN"],
            "TELEGRAM_WEBHOOK_SECRET_FILE": "/run/secrets/telegram_webhook_secret",
        },
        "telegram-webhook-info": {
            "TELEGRAM_BOT_TOKEN_FILE": "/run/secrets/telegram_bot_token",
            "TELEGRAM_WEBHOOK_PUBLIC_ORIGIN": runtime["YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN"],
        },
        "migrate": secret_environments["migration-database.env"],
        "backup-create": {
            **secret_environments["backup-database.env"],
            "YOLPOL_BACKUP_AGE_RECIPIENT": runtime["YOLPOL_STAGING_BACKUP_AGE_RECIPIENT"],
            "YOLPOL_BACKUP_DIRECTORY": "/backups",
            "YOLPOL_DEPLOYMENT_ENVIRONMENT": "staging",
            "YOLPOL_GIT_REVISION": runtime["YOLPOL_GIT_REVISION"],
        },
        "backup-verify": {"YOLPOL_BACKUP_DIRECTORY": "/backups"},
        "backup-deep-verify": {
            "YOLPOL_BACKUP_AGE_IDENTITY_FILE": "/run/secrets/backup_age_identity",
            "YOLPOL_BACKUP_DIRECTORY": "/backups",
        },
        "backup-retention": {
            "YOLPOL_BACKUP_DIRECTORY": "/backups",
            "YOLPOL_BACKUP_RETENTION_COUNT": "14",
            "YOLPOL_DEPLOYMENT_ENVIRONMENT": "staging",
        },
    }
    resources = {
        "edge": ("268435456", 0.20, 100, "unless-stopped"),
        "web": ("805306368", 0.75, 200, "on-failure:5"),
        "postgres": ("1073741824", 0.75, 200, "unless-stopped"),
        "inquiry-notifications": ("402653184", 0.25, 150, "on-failure:5"),
        "conversation-translation": ("402653184", 0.25, 150, "on-failure:5"),
        "conversation-ai-fallback": ("402653184", 0.25, 150, "on-failure:5"),
        "staff-provision": ("536870912", 0.50, 100, "no"),
        "staff-bootstrap-super-admin": ("536870912", 0.50, 100, "no"),
        "telegram-webhook-set": ("536870912", 0.50, 100, "no"),
        "telegram-webhook-info": ("536870912", 0.50, 100, "no"),
        "migrate": ("536870912", 0.50, 100, "no"),
        "backup-create": ("536870912", 0.50, 100, "no"),
        "backup-verify": ("536870912", 0.50, 100, "no"),
        "backup-deep-verify": ("536870912", 0.50, 100, "no"),
        "backup-retention": ("536870912", 0.50, 100, "no"),
    }
    for name, service in services.items():
        validate_generic_service_security(name, service)
        require(service.get("image") == images[name], "Staging service image")
        validate_command(service, commands[name])
        is_staff_operation = name in {"staff-provision", "staff-bootstrap-super-admin"}
        is_telegram_operation = name in {"telegram-webhook-set", "telegram-webhook-info"}
        expected_profiles = (
            {"migration"} if name == "migrate"
            else {"backup"} if name.startswith("backup-")
            else {"staff-operations"} if is_staff_operation
            else {"telegram-operations"} if is_telegram_operation
            else set()
        )
        validate_profiles(service, expected_profiles)
        validate_no_build(service)
        require(string_set(service.get("networks"), "Staging service networks") == networks[name], "Staging service network")
        require(normalized_mounts(service) == mounts.get(name, set()), "Staging service mount")
        require(normalized_secrets(service) == secrets.get(name, set()), "Staging service secret")
        validate_environment(service, environments[name])
        is_backup = name.startswith("backup-")
        is_read_only_operation = is_backup or is_staff_operation or is_telegram_operation
        validate_service_hardening(
            service,
            read_only=is_read_only_operation,
            user="10001:10001" if is_staff_operation or is_telegram_operation else None,
            tmpfs={"/tmp:rw,noexec,nosuid,nodev,size=64m"} if is_read_only_operation else set(),
        )
        require(service.get("stdin_open") is (True if is_staff_operation else None), "Compose interactive stdin")
        require(service.get("tty") is (True if is_staff_operation else None), "Compose interactive TTY")
        memory_bytes, cpus, pids, restart = resources[name]
        validate_resources(service, memory_bytes=memory_bytes, cpus=cpus, pids=pids, restart=restart)
        if name != "edge":
            validate_ports(service, set())
    validate_ports(services["edge"], {("0.0.0.0", 80, "80", "tcp"), ("0.0.0.0", 443, "443", "tcp"), ("0.0.0.0", 443, "443", "udp")})
    require(services["backup-verify"].get("network_mode") == "none", "backup verify network")
    require(services["backup-deep-verify"].get("network_mode") == "none", "backup deep verify network")
    require(services["backup-retention"].get("network_mode") == "none", "backup retention network")
    validate_exact_top_level_resources(
        model,
        {
            "edge": ("yolpol-staging_edge", False, False),
            "backend": ("yolpol-staging_backend", True, False),
            "provider_egress": ("yolpol-staging_provider_egress", False, False),
        },
        {
            "postgres_data": "yolpol-staging_postgres_data",
            "caddy_data": "yolpol-staging_caddy_data",
            "caddy_config": "yolpol-staging_caddy_config",
        },
        {
            "telegram_bot_token": "/opt/yolpol/staging/secrets/telegram-bot-token",
            "telegram_webhook_secret": "/opt/yolpol/staging/secrets/telegram-webhook-secret",
            "groq_api_key": "/opt/yolpol/staging/secrets/groq-api-key",
            "backup_age_identity": "/opt/yolpol/staging/secrets/backup-age-identity",
        },
    )


def validate_monitoring_compose_model(model: dict[str, Any], runtime: dict[str, str]) -> None:
    exact_keys(model, {"name", "networks", "secrets", "services", "volumes", "x-json-logging", "x-service-security"}, "Monitoring Compose model")
    require(model.get("name") == "yolpol-monitoring", "Monitoring project name")
    services = service_map(model, MONITORING_SERVICES)
    images = {**MONITORING_UPSTREAM_IMAGES, "operations-exporter": runtime["YOLPOL_OPERATIONS_METRICS_IMAGE"]}
    expected_networks = {
        "prometheus": {"monitoring"},
        "alertmanager": {"monitoring", "alert_egress"},
        "node-exporter": {"monitoring"},
        "cadvisor": {"monitoring"},
        "postgres-exporter": {"monitoring", "staging_backend"},
        "blackbox-exporter": {"monitoring", "staging_edge"},
        "operations-exporter": {"monitoring", "staging_backend"},
    }
    expected_mounts = {
        "prometheus": {
            ("bind", "/opt/yolpol/monitoring/prometheus/prometheus.yml", "/etc/prometheus/prometheus.yml", True),
            ("bind", "/opt/yolpol/monitoring/prometheus/rules", "/etc/prometheus/rules", True),
            ("volume", "prometheus_data", "/prometheus", False),
        },
        "alertmanager": {
            ("bind", runtime["YOLPOL_ALERTMANAGER_CONFIG_FILE"], "/etc/alertmanager/alertmanager.yml", True),
            ("volume", "alertmanager_data", "/alertmanager", False),
        },
        "node-exporter": {
            ("bind", "/proc", "/host/proc", True),
            ("bind", "/sys", "/host/sys", True),
            ("bind", "/", "/host/root", True),
        },
        "cadvisor": {
            ("bind", "/", "/rootfs", True),
            ("bind", "/sys", "/sys", True),
            ("bind", "/var/lib/docker", "/var/lib/docker", True),
            ("bind", "/var/run/docker.sock", "/var/run/docker.sock", True),
        },
        "blackbox-exporter": {
            ("bind", "/opt/yolpol/monitoring/blackbox/blackbox.yml", "/etc/blackbox_exporter/blackbox.yml", True)
        },
        "operations-exporter": {("bind", "/opt/yolpol/staging/backups", "/backups", True)},
    }
    expected_secrets = {
        "alertmanager": {("alert_telegram_bot_token", "/run/secrets/alert_telegram_bot_token"), ("alert_telegram_chat_id", "/run/secrets/alert_telegram_chat_id")},
        "postgres-exporter": {
            ("staging_postgres_exporter_uri", "/run/secrets/staging_postgres_exporter_uri"),
            ("staging_postgres_exporter_user", "/run/secrets/staging_postgres_exporter_user"),
            ("staging_postgres_exporter_password", "/run/secrets/staging_postgres_exporter_password"),
        },
        "operations-exporter": {("staging_operations_database_url", "/run/secrets/staging_operations_database_url")},
    }
    commands = {
        "prometheus": [
            "--config.file=/etc/prometheus/prometheus.yml",
            "--storage.tsdb.path=/prometheus",
            "--storage.tsdb.retention.time=15d",
            "--storage.tsdb.retention.size=2GB",
            "--web.listen-address=0.0.0.0:9090",
        ],
        "alertmanager": [
            "--config.file=/etc/alertmanager/alertmanager.yml",
            "--storage.path=/alertmanager",
            "--data.retention=120h",
            "--web.listen-address=0.0.0.0:9093",
        ],
        "node-exporter": [
            "--path.procfs=/host/proc",
            "--path.sysfs=/host/sys",
            "--path.rootfs=/host/root",
            "--collector.filesystem.mount-points-exclude=^/(dev|proc|run/credentials/.+|sys|var/lib/docker/.+)($$|/)",
            "--collector.filesystem.fs-types-exclude=^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$$",
        ],
        "cadvisor": [
            "--docker_only=true",
            "--housekeeping_interval=30s",
            "--disable_metrics=advtcp,cpu_topology,cpuset,hugetlb,memory_numa,perf_event,process,referenced_memory,resctrl,sched,tcp,udp",
        ],
        "postgres-exporter": [
            "--log.format=json",
            "--no-collector.locks",
            "--no-collector.replication",
            "--no-collector.replication_slots",
            "--no-collector.stat_archiver",
            "--no-collector.stat_bgwriter",
            "--no-collector.stat_progress_vacuum",
            "--no-collector.stat_replication",
            "--no-collector.stat_user_tables",
            "--no-collector.statio_user_tables",
            "--no-collector.wal",
        ],
        "blackbox-exporter": ["--config.file=/etc/blackbox_exporter/blackbox.yml"],
        "operations-exporter": None,
    }
    environments = {
        "prometheus": {},
        "alertmanager": {},
        "node-exporter": {},
        "cadvisor": {},
        "postgres-exporter": {
            "DATA_SOURCE_PASS_FILE": "/run/secrets/staging_postgres_exporter_password",
            "DATA_SOURCE_URI_FILE": "/run/secrets/staging_postgres_exporter_uri",
            "DATA_SOURCE_USER_FILE": "/run/secrets/staging_postgres_exporter_user",
            "PG_EXPORTER_COLLECTION_TIMEOUT": "5s",
        },
        "blackbox-exporter": {},
        "operations-exporter": {
            "YOLPOL_DEPLOYMENT_ENVIRONMENT": "staging",
            "YOLPOL_MONITORING_BACKUP_DIRECTORY": "/backups",
            "YOLPOL_MONITORING_BACKUP_ENABLED": "false",
            "YOLPOL_MONITORING_BACKUP_SCAN_INTERVAL_MS": "300000",
            "YOLPOL_MONITORING_DATABASE_URL_FILE": "/run/secrets/staging_operations_database_url",
            "YOLPOL_MONITORING_PORT": "9464",
        },
    }
    resources = {
        "prometheus": ("536870912", 0.50, 150),
        "alertmanager": ("134217728", 0.15, 100),
        "node-exporter": ("134217728", 0.15, 100),
        "cadvisor": ("268435456", 0.30, 150),
        "postgres-exporter": ("134217728", 0.15, 100),
        "blackbox-exporter": ("134217728", 0.10, 100),
        "operations-exporter": ("134217728", 0.15, 100),
    }
    for name, service in services.items():
        validate_generic_service_security(name, service, allowed_host_pid=name == "node-exporter")
        require(service.get("image") == images[name], "Monitoring service image")
        validate_command(service, commands[name])
        validate_profiles(service, set())
        validate_no_build(service)
        require(string_set(service.get("networks"), "Monitoring service networks") == expected_networks[name], "Monitoring service network")
        require(normalized_mounts(service) == expected_mounts.get(name, set()), "Monitoring service mount")
        require(normalized_secrets(service) == expected_secrets.get(name, set()), "Monitoring service secret")
        validate_environment(service, environments[name])
        validate_service_hardening(
            service,
            read_only=True,
            user="65534:65534" if name in {"node-exporter", "blackbox-exporter"} else None,
            tmpfs={"/tmp:rw,noexec,nosuid,nodev,size=32m"} if name in {"prometheus", "alertmanager", "operations-exporter"} else set(),
        )
        memory_bytes, cpus, pids = resources[name]
        validate_resources(service, memory_bytes=memory_bytes, cpus=cpus, pids=pids, restart="unless-stopped")
        if name not in {"prometheus", "alertmanager"}:
            validate_ports(service, set())
    validate_ports(services["prometheus"], {("127.0.0.1", 9090, "9090", "tcp")})
    validate_ports(services["alertmanager"], {("127.0.0.1", 9093, "9093", "tcp")})
    validate_exact_top_level_resources(
        model,
        {
            "monitoring": ("yolpol-monitoring_monitoring", True, False),
            "alert_egress": ("yolpol-monitoring_alert_egress", False, False),
            "staging_edge": ("yolpol-staging_edge", False, True),
            "staging_backend": ("yolpol-staging_backend", False, True),
        },
        {
            "prometheus_data": "yolpol-monitoring_prometheus_data",
            "alertmanager_data": "yolpol-monitoring_alertmanager_data",
        },
        {
            "alert_telegram_bot_token": "/opt/yolpol/monitoring/secrets/alert-telegram-bot-token",
            "alert_telegram_chat_id": "/opt/yolpol/monitoring/secrets/alert-telegram-chat-id",
            "staging_postgres_exporter_uri": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-uri",
            "staging_postgres_exporter_user": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-user",
            "staging_postgres_exporter_password": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-password",
            "staging_operations_database_url": "/opt/yolpol/monitoring/secrets/staging-operations-database-url",
        },
    )


def load_json_from_stdin() -> dict[str, Any]:
    try:
        return parse_compose_json(sys.stdin.read(4_000_001))
    except UnicodeError as error:
        raise PolicyError("Compose model encoding") from error


def main() -> None:
    command = sys.argv[1] if len(sys.argv) == 2 else ""
    if command == "validate-staging":
        load_staging_contract()
    elif command == "validate-monitoring":
        load_monitoring_contract()
    elif command == "validate-staging-compose":
        runtime, _, secret_environments = load_staging_contract()
        validate_staging_compose_model(load_json_from_stdin(), runtime, secret_environments)
    elif command == "validate-monitoring-compose":
        runtime, _ = load_monitoring_contract()
        validate_monitoring_compose_model(load_json_from_stdin(), runtime)
    else:
        raise PolicyError("command")


if __name__ == "__main__":
    try:
        main()
    except (PolicyError, OSError, ValueError, TypeError):
        print("yolpol-deploy-policy: validation failed", file=sys.stderr)
        raise SystemExit(1)
