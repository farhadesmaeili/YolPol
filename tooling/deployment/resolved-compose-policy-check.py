#!/usr/bin/python3
"""Test-only bridge for validating a synthetic resolved Compose model."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
POLICY_PATH = REPOSITORY_ROOT / "deploy/operations/yolpol-deploy-policy.py"
SPEC = importlib.util.spec_from_file_location("yolpol_deploy_policy", POLICY_PATH)
assert SPEC is not None and SPEC.loader is not None
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)


def normalize_host_paths(model: dict[str, object], mode: str) -> None:
    """Normalize host-dependent test paths to the canonical promoted layout."""
    services = model["services"]
    assert isinstance(services, dict)
    bind_sources = {
        "staging": {
            ("edge", "/etc/caddy/Caddyfile"): "/opt/yolpol/staging/Caddyfile",
            ("backup-create", "/backups"): "/opt/yolpol/staging/backups",
            ("backup-verify", "/backups"): "/opt/yolpol/staging/backups",
            ("backup-deep-verify", "/backups"): "/opt/yolpol/staging/backups",
            ("backup-retention", "/backups"): "/opt/yolpol/staging/backups",
        },
        "production": {
            ("edge", "/etc/caddy/Caddyfile"): "/opt/yolpol/production/Caddyfile",
            ("backup-create", "/backups"): "/opt/yolpol/production/backups",
            ("backup-verify", "/backups"): "/opt/yolpol/production/backups",
            ("backup-deep-verify", "/backups"): "/opt/yolpol/production/backups",
            ("backup-retention", "/backups"): "/opt/yolpol/production/backups",
            ("restore", "/backups"): "/opt/yolpol/production/backups",
        },
        "monitoring": {
            ("prometheus", "/etc/prometheus/prometheus.yml"): "/opt/yolpol/monitoring/prometheus/prometheus.yml",
            ("prometheus", "/etc/prometheus/rules"): "/opt/yolpol/monitoring/prometheus/rules",
            ("alertmanager", "/etc/alertmanager/alertmanager.yml"): "/opt/yolpol/monitoring/alertmanager/alertmanager.local.yml",
            ("blackbox-exporter", "/etc/blackbox_exporter/blackbox.yml"): "/opt/yolpol/monitoring/blackbox/blackbox.yml",
            ("operations-exporter", "/backups"): "/opt/yolpol/staging/backups",
        },
    }[mode]
    for service_name, raw_service in services.items():
        assert isinstance(service_name, str) and isinstance(raw_service, dict)
        volumes = raw_service.get("volumes", [])
        assert isinstance(volumes, list)
        for volume in volumes:
            assert isinstance(volume, dict)
            replacement = bind_sources.get((service_name, volume.get("target")))
            if replacement is not None:
                volume["source"] = replacement
    secrets = model["secrets"]
    assert isinstance(secrets, dict)
    expected_secret_paths = {
        "staging": {
            "telegram_bot_token": "/opt/yolpol/staging/secrets/telegram-bot-token",
            "telegram_webhook_secret": "/opt/yolpol/staging/secrets/telegram-webhook-secret",
            "groq_api_key": "/opt/yolpol/staging/secrets/groq-api-key",
            "backup_age_identity": "/opt/yolpol/staging/secrets/backup-age-identity",
        },
        "production": {
            "telegram_bot_token": "/opt/yolpol/production/secrets/telegram-bot-token",
            "telegram_webhook_secret": "/opt/yolpol/production/secrets/telegram-webhook-secret",
            "groq_api_key": "/opt/yolpol/production/secrets/groq-api-key",
            "backup_age_identity": "/opt/yolpol/production/secrets/backup-age-identity",
        },
        "monitoring": {
            "alert_telegram_bot_token": "/opt/yolpol/monitoring/secrets/alert-telegram-bot-token",
            "alert_telegram_chat_id": "/opt/yolpol/monitoring/secrets/alert-telegram-chat-id",
            "staging_postgres_exporter_uri": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-uri",
            "staging_postgres_exporter_user": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-user",
            "staging_postgres_exporter_password": "/opt/yolpol/monitoring/secrets/staging-postgres-exporter-password",
            "staging_operations_database_url": "/opt/yolpol/monitoring/secrets/staging-operations-database-url",
        },
    }[mode]
    for secret_name, path in expected_secret_paths.items():
        raw_secret = secrets[secret_name]
        assert isinstance(raw_secret, dict)
        raw_secret["file"] = path


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) == 2 else ""
    model = policy.load_json_from_stdin()
    normalize_host_paths(model, mode)
    if mode == "staging":
        runtime = policy.parse_runtime_environment(
            REPOSITORY_ROOT / "deploy/staging/runtime.env.example",
            policy.staging_expected_keys(),
        )
        secret_environments = {
            "postgres": {
                "POSTGRES_DB": "yolpol",
                "POSTGRES_USER": "yolpol",
                "POSTGRES_PASSWORD": "synthetic-password",
            },
            "app-database.env": {"DATABASE_URL": "postgresql://yolpol:synthetic-password@postgres:5432/yolpol"},
            "migration-database.env": {"DATABASE_URL": "postgresql://yolpol:synthetic-password@postgres:5432/yolpol"},
            "backup-database.env": {"DATABASE_URL": "postgresql://yolpol:synthetic-password@postgres:5432/yolpol"},
        }
        policy.validate_staging_compose_model(model, runtime, secret_environments)
    elif mode == "production":
        runtime = policy.parse_runtime_environment(
            REPOSITORY_ROOT / "deploy/production/runtime.env.example",
            policy.production_expected_keys(),
        )
        secret_environments = {
            "postgres": {
                "POSTGRES_DB": "yolpol_production",
                "POSTGRES_USER": "yolpol_production",
                "POSTGRES_PASSWORD": "synthetic-production-password",
            },
            "app-database.env": {"DATABASE_URL": "postgresql://yolpol_app:synthetic-production-password@postgres:5432/yolpol_production"},
            "migration-database.env": {"DATABASE_URL": "postgresql://yolpol_migration:synthetic-production-password@postgres:5432/yolpol_production"},
            "backup-database.env": {"DATABASE_URL": "postgresql://yolpol_backup:synthetic-production-password@postgres:5432/yolpol_production"},
            "restore-database.env": {"DATABASE_URL": "postgresql://yolpol_restore:synthetic-production-password@recovery-postgres:5432/yolpol_recovery"},
        }
        policy.validate_production_compose_model(model, runtime, secret_environments)
    elif mode == "monitoring":
        runtime = policy.parse_runtime_environment(
            REPOSITORY_ROOT / "deploy/monitoring/runtime.env.example",
            policy.monitoring_expected_keys(),
        )
        policy.validate_monitoring_compose_model(model, runtime)
    else:
        raise policy.PolicyError("test mode")


if __name__ == "__main__":
    try:
        main()
    except (policy.PolicyError, OSError, ValueError, TypeError) as error:
        print(f"resolved-compose-policy-check: {error}", file=sys.stderr)
        raise SystemExit(1)
