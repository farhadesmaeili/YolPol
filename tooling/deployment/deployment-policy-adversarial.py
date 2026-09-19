#!/usr/bin/python3
"""Behavioral adversarial tests for the privileged deployment policy helper."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
POLICY_PATH = REPOSITORY_ROOT / "deploy/operations/yolpol-deploy-policy.py"
SPEC = importlib.util.spec_from_file_location("yolpol_deploy_policy", POLICY_PATH)
assert SPEC is not None and SPEC.loader is not None
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)


def valid_manifest(revision: str = "a" * 40, version: str = "0.1.0") -> dict[str, object]:
    images: list[dict[str, str]] = []
    for role, repository in policy.EXPECTED_IMAGE_REPOSITORIES.items():
        digest = f"sha256:{hashlib.sha256(f'{role}:{revision}'.encode()).hexdigest()}"
        images.append(
            {
                "role": role,
                "dockerTarget": policy.EXPECTED_DOCKER_TARGETS[role],
                "repository": repository,
                "shaTag": f"sha-{revision}",
                "semverTag": f"v{version}",
                "digest": digest,
                "immutableRef": f"{repository}@{digest}",
            }
        )
    return {
        "manifestVersion": 1,
        "version": version,
        "tag": f"v{version}",
        "gitSha": revision,
        "repository": policy.EXPECTED_SOURCE_REPOSITORY,
        "platform": "linux/amd64",
        "database": {"latestMigration": "0022_global_translation_settings", "migrationSetSha256": "b" * 64},
        "images": images,
    }


def validate_manifest(value: dict[str, object]) -> dict[str, object]:
    content = (json.dumps(value, separators=(",", ":")) + "\n").encode()
    checksum = f"{hashlib.sha256(content).hexdigest()}  release-manifest.json\n"
    return policy.validate_manifest_bytes(content, checksum)


class RuntimeEnvironmentTests(unittest.TestCase):
    def test_accepts_only_the_closed_schema(self) -> None:
        text = "A=one\nB=two\n"
        self.assertEqual(policy.parse_runtime_environment_text(text, {"A", "B"}), {"A": "one", "B": "two"})

    def assert_rejected(self, text: str, keys: set[str]) -> None:
        with self.assertRaises(policy.PolicyError):
            policy.parse_runtime_environment_text(text, keys)

    def test_rejects_duplicate_unknown_compose_docker_and_control_inputs(self) -> None:
        attacks = [
            ("A=one\nA=two\n", {"A"}),
            ("A=one\nEVIL=two\n", {"A"}),
            ("A=one\nCOMPOSE_FILE=/tmp/evil.yml\n", {"A", "COMPOSE_FILE"}),
            ("A=one\nDOCKER_HOST=tcp://attacker\n", {"A", "DOCKER_HOST"}),
            ("A=one\r\n", {"A"}),
            ("A=one\x1b[31m\n", {"A"}),
            ("A=$(id)\n", {"A"}),
            ("A=one two\n", {"A"}),
        ]
        for text, keys in attacks:
            with self.subTest(text=repr(text)):
                self.assert_rejected(text, keys)


class ReleaseManifestTests(unittest.TestCase):
    def test_accepts_the_exact_authenticated_promotion_contract(self) -> None:
        parsed = validate_manifest(valid_manifest())
        self.assertEqual(parsed["gitSha"], "a" * 40)

    def test_rejects_wrong_repository_revision_digest_and_duplicate_json_key(self) -> None:
        mutations = []
        wrong_repository = valid_manifest()
        wrong_repository["repository"] = "https://github.com/attacker/YolPol"
        mutations.append(wrong_repository)
        short_revision = valid_manifest()
        short_revision["gitSha"] = "a" * 7
        mutations.append(short_revision)
        mutable_image = valid_manifest()
        mutable_image["images"][0]["immutableRef"] = "ghcr.io/farhadesmaeili/yolpol-web:latest"  # type: ignore[index]
        mutations.append(mutable_image)
        wrong_role_repository = valid_manifest()
        wrong_role_repository["images"][0]["repository"] = "ghcr.io/attacker/root-shell"  # type: ignore[index]
        mutations.append(wrong_role_repository)
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                with self.assertRaises(policy.PolicyError):
                    validate_manifest(mutation)

        duplicate = b'{"manifestVersion":1,"manifestVersion":1}\n'
        checksum = f"{hashlib.sha256(duplicate).hexdigest()}  release-manifest.json\n"
        with self.assertRaises(policy.PolicyError):
            policy.validate_manifest_bytes(duplicate, checksum)

    def test_rejects_a_checksum_that_does_not_authenticate_the_bytes(self) -> None:
        content = (json.dumps(valid_manifest()) + "\n").encode()
        with self.assertRaises(policy.PolicyError):
            policy.validate_manifest_bytes(content, f"{'0' * 64}  release-manifest.json\n")

    def test_runtime_images_and_revision_must_match_the_same_manifest(self) -> None:
        manifest = validate_manifest(valid_manifest())
        images = manifest["imagesByRole"]
        assert isinstance(images, dict)
        staging = {
            **policy.STAGING_FIXED_VALUES,
            "YOLPOL_GIT_REVISION": manifest["gitSha"],
            "YOLPOL_WEB_IMAGE": images["web"]["immutableRef"],
            "YOLPOL_WORKER_IMAGE": images["worker"]["immutableRef"],
            "YOLPOL_MIGRATION_IMAGE": images["migration"]["immutableRef"],
            "YOLPOL_BACKUP_RESTORE_IMAGE": images["backup-restore"]["immutableRef"],
            "YOLPOL_STAGING_BACKUP_AGE_RECIPIENT": "age1" + "q" * 58,
            "YOLPOL_STAGING_TELEGRAM_BOT_USERNAME": "YolpolStagingBot",
        }
        policy.validate_staging_runtime(staging, manifest)
        for key, malicious in (
            ("YOLPOL_GIT_REVISION", "a" * 39),
            ("YOLPOL_WEB_IMAGE", "ghcr.io/attacker/root-shell@sha256:" + "a" * 64),
            ("YOLPOL_WEB_IMAGE", "ghcr.io/farhadesmaeili/yolpol-web:latest"),
            ("YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN", "https://attacker.example"),
        ):
            attacked = {**staging, key: malicious}
            with self.subTest(key=key, malicious=malicious), self.assertRaises(policy.PolicyError):
                policy.validate_staging_runtime(attacked, manifest)

    def test_production_runtime_is_closed_and_bound_to_the_same_manifest(self) -> None:
        manifest = validate_manifest(valid_manifest())
        images = manifest["imagesByRole"]
        assert isinstance(images, dict)
        production = {
            **policy.PRODUCTION_FIXED_VALUES,
            "YOLPOL_GIT_REVISION": manifest["gitSha"],
            "YOLPOL_WEB_IMAGE": images["web"]["immutableRef"],
            "YOLPOL_WORKER_IMAGE": images["worker"]["immutableRef"],
            "YOLPOL_MIGRATION_IMAGE": images["migration"]["immutableRef"],
            "YOLPOL_BACKUP_RESTORE_IMAGE": images["backup-restore"]["immutableRef"],
            "YOLPOL_PRODUCTION_BACKUP_AGE_RECIPIENT": "age1" + "q" * 58,
            "YOLPOL_PRODUCTION_TELEGRAM_BOT_USERNAME": "YolpolProductionBot",
        }
        policy.validate_production_runtime(production, manifest)
        for key, malicious in (
            ("YOLPOL_GIT_REVISION", "a" * 39),
            ("YOLPOL_WEB_IMAGE", "ghcr.io/attacker/root-shell@sha256:" + "a" * 64),
            ("YOLPOL_WORKER_IMAGE", "ghcr.io/farhadesmaeili/yolpol-worker:latest"),
            ("YOLPOL_PRODUCTION_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN", "https://staging.yolpol.com"),
            ("YOLPOL_PRODUCTION_DATABASE_ENV_FILE", "/opt/yolpol/staging/secrets/app-database.env"),
        ):
            attacked = {**production, key: malicious}
            with self.subTest(key=key, malicious=malicious), self.assertRaises(policy.PolicyError):
                policy.validate_production_runtime(attacked, manifest)

    def test_staging_and_production_release_progression_is_independent(self) -> None:
        staging_manifest = validate_manifest(valid_manifest("8" * 40, "0.1.8"))
        production_manifest = validate_manifest(valid_manifest("7" * 40, "0.1.7"))
        staging_images = staging_manifest["imagesByRole"]
        production_images = production_manifest["imagesByRole"]
        assert isinstance(staging_images, dict) and isinstance(production_images, dict)
        staging = {
            **policy.STAGING_FIXED_VALUES,
            "YOLPOL_GIT_REVISION": staging_manifest["gitSha"],
            "YOLPOL_WEB_IMAGE": staging_images["web"]["immutableRef"],
            "YOLPOL_WORKER_IMAGE": staging_images["worker"]["immutableRef"],
            "YOLPOL_MIGRATION_IMAGE": staging_images["migration"]["immutableRef"],
            "YOLPOL_BACKUP_RESTORE_IMAGE": staging_images["backup-restore"]["immutableRef"],
            "YOLPOL_STAGING_BACKUP_AGE_RECIPIENT": "age1" + "q" * 58,
            "YOLPOL_STAGING_TELEGRAM_BOT_USERNAME": "YolpolStagingBot",
        }
        production = {
            **policy.PRODUCTION_FIXED_VALUES,
            "YOLPOL_GIT_REVISION": production_manifest["gitSha"],
            "YOLPOL_WEB_IMAGE": production_images["web"]["immutableRef"],
            "YOLPOL_WORKER_IMAGE": production_images["worker"]["immutableRef"],
            "YOLPOL_MIGRATION_IMAGE": production_images["migration"]["immutableRef"],
            "YOLPOL_BACKUP_RESTORE_IMAGE": production_images["backup-restore"]["immutableRef"],
            "YOLPOL_PRODUCTION_BACKUP_AGE_RECIPIENT": "age1" + "q" * 58,
            "YOLPOL_PRODUCTION_TELEGRAM_BOT_USERNAME": "YolpolProductionBot",
        }
        policy.validate_staging_runtime(staging, staging_manifest)
        policy.validate_production_runtime(production, production_manifest)
        with self.assertRaises(policy.PolicyError):
            policy.validate_production_runtime(production, staging_manifest)
        with self.assertRaises(policy.PolicyError):
            policy.validate_staging_runtime(staging, production_manifest)
        self.assertNotEqual(policy.STAGING_MANIFEST, policy.PRODUCTION_MANIFEST)
        self.assertEqual(policy.STAGING_MANIFEST.as_posix(), "/opt/yolpol/releases/staging/active/release-manifest.json")
        self.assertEqual(policy.PRODUCTION_MANIFEST.as_posix(), "/opt/yolpol/releases/production/active/release-manifest.json")


class ResolvedComposePolicyTests(unittest.TestCase):
    def base_service(self) -> dict[str, object]:
        return {
            "image": "example.invalid/image@sha256:" + "a" * 64,
            "logging": {"driver": "json-file", "options": {"max-file": "3", "max-size": "10m"}},
        }

    def test_rejects_privilege_namespace_device_and_unknown_service_controls(self) -> None:
        attacks = [
            {"privileged": True},
            {"devices": ["/dev/kvm:/dev/kvm"]},
            {"cap_add": ["SYS_ADMIN"]},
            {"network_mode": "host"},
            {"pid": "host"},
            {"ipc": "host"},
            {"volumes_from": ["attacker"]},
            {"userns_mode": "host"},
            {"uts": "host"},
            {"cgroup": "host"},
        ]
        for attack in attacks:
            service = {**self.base_service(), **attack}
            with self.subTest(attack=attack), self.assertRaises(policy.PolicyError):
                policy.validate_generic_service_security("victim", service)

    def test_host_pid_is_allowed_only_for_the_exact_node_exporter_slot(self) -> None:
        service = {**self.base_service(), "pid": "host"}
        policy.validate_generic_service_security("node-exporter", service, allowed_host_pid=True)
        with self.assertRaises(policy.PolicyError):
            policy.validate_generic_service_security("other", service)

    def test_rejects_arbitrary_mount_secret_port_and_environment_shapes(self) -> None:
        service = {
            **self.base_service(),
            "volumes": [{"type": "bind", "source": "/", "target": "/host", "read_only": False}],
        }
        self.assertNotEqual(policy.normalized_mounts(service), {("bind", "/safe", "/data", True)})
        with self.assertRaises(policy.PolicyError):
            policy.validate_ports(
                {"ports": [{"host_ip": "0.0.0.0", "target": 2375, "published": "2375", "protocol": "tcp"}]},
                set(),
            )
        with self.assertRaises(policy.PolicyError):
            policy.validate_environment({"environment": {"DOCKER_HOST": "unix:///var/run/docker.sock"}}, {})
        with self.assertRaises(policy.PolicyError):
            policy.normalized_secrets({"secrets": [{"source": "one", "target": "/run/one"}, {"source": "one", "target": "/run/one"}]})

    def test_rejects_external_or_driver_control_on_root_owned_resources(self) -> None:
        model = {
            "name": "project",
            "networks": {"safe": {"name": "project_safe", "ipam": {}, "driver": "attacker"}},
            "volumes": {"data": {"name": "project_data"}},
            "secrets": {"token": {"name": "project_token", "file": "/safe/token"}},
        }
        with self.assertRaises(policy.PolicyError):
            policy.validate_exact_top_level_resources(
                model,
                {"safe": ("project_safe", False, False)},
                {"data": "project_data"},
                {"token": "/safe/token"},
            )

    def test_rejects_duplicate_and_oversized_compose_json(self) -> None:
        with self.assertRaises(policy.PolicyError):
            policy.parse_compose_json('{"services":{},"services":{}}')
        with self.assertRaises(policy.PolicyError):
            policy.parse_compose_json(" " * 4_000_001)

    def test_rejects_any_compose_build_metadata(self) -> None:
        for build in (
            None,
            {"context": "/opt", "dockerfile": "Dockerfile", "target": "runtime"},
            {"context": "/opt/yolpol", "dockerfile": "Dockerfile", "target": "runtime"},
        ):
            with self.subTest(build=build), self.assertRaisesRegex(policy.PolicyError, "unexpected Compose build"):
                policy.validate_no_build({"build": build})


if __name__ == "__main__":
    unittest.main(verbosity=2)
