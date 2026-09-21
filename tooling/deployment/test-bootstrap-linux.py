#!/usr/bin/python3
"""Disposable Linux tests for the root-only bootstrap primitives."""

from __future__ import annotations

import contextlib
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


BOOTSTRAP_PATH = Path("/opt/yolpol/bin/yolpol-bootstrap")
POLICY_PATH = Path("/opt/yolpol/bin/yolpol-deploy-policy")


def load_module(name: str, path: Path):
    specification = importlib.util.spec_from_file_location(name, path)
    if specification is None or specification.loader is None:
        specification = importlib.util.spec_from_loader(name, importlib.machinery.SourceFileLoader(name, str(path)))
    if specification is None or specification.loader is None:
        raise RuntimeError(f"Cannot load {path}.")
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


bootstrap = load_module("yolpol_bootstrap_test", BOOTSTRAP_PATH)
policy = load_module("yolpol_policy_test", POLICY_PATH)


def release_artifacts(version: str, git_sha: str) -> tuple[bytes, bytes]:
    images = []
    for index, role in enumerate(("web", "worker", "migration", "backup-restore", "operations-metrics"), start=1):
        digest = f"sha256:{index:064x}"
        repository = policy.EXPECTED_IMAGE_REPOSITORIES[role]
        images.append({
            "role": role,
            "dockerTarget": policy.EXPECTED_DOCKER_TARGETS[role],
            "repository": repository,
            "shaTag": f"sha-{git_sha}",
            "semverTag": f"v{version}",
            "digest": digest,
            "immutableRef": f"{repository}@{digest}",
        })
    manifest = json.dumps({
        "manifestVersion": 1,
        "version": version,
        "tag": f"v{version}",
        "gitSha": git_sha,
        "repository": policy.EXPECTED_SOURCE_REPOSITORY,
        "platform": "linux/amd64",
        "database": {"latestMigration": "0022_global_translation_settings", "migrationSetSha256": "f" * 64},
        "images": images,
    }, separators=(",", ":")).encode("utf-8")
    checksum = f"{hashlib.sha256(manifest).hexdigest()}  release-manifest.json\n".encode("ascii")
    return manifest, checksum


class BootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = Path(tempfile.mkdtemp(prefix="yolpol-bootstrap-", dir="/root"))

    def tearDown(self) -> None:
        shutil.rmtree(self.temporary)

    def test_supported_host_and_root_requirement(self) -> None:
        bootstrap.validate_supported_host()
        with mock.patch.object(bootstrap, "read_os_release", return_value={"ID": "ubuntu", "VERSION_ID": "24.04"}):
            with self.assertRaisesRegex(bootstrap.BootstrapError, "unsupported host"):
                bootstrap.validate_supported_host()
        with mock.patch.object(bootstrap.platform, "machine", return_value="aarch64"):
            with self.assertRaisesRegex(bootstrap.BootstrapError, "unsupported architecture"):
                bootstrap.validate_supported_host()
        with mock.patch.object(bootstrap.os, "geteuid", return_value=1001):
            with self.assertRaisesRegex(bootstrap.BootstrapError, "must run as root"):
                bootstrap.require_root()

    def test_deployment_agent_identity_and_exact_sudo_are_enforced(self) -> None:
        with mock.patch.object(bootstrap, "validate_docker_socket"):
            bootstrap.validate_deployment_agent()
        account = __import__("pwd").getpwnam("yolpol-deployment-agent")
        self.assertEqual((account.pw_uid, account.pw_gid, account.pw_dir, account.pw_shell), (
            1002, 1002, "/nonexistent", "/usr/sbin/nologin",
        ))

    def test_directory_creation_is_idempotent_and_rejects_incompatible_state(self) -> None:
        target = self.temporary / "foundation"
        contract = bootstrap.DirectoryContract(str(target), 0, 0, 0o750)
        bootstrap.ensure_directory(contract)
        first = target.stat()
        bootstrap.ensure_directory(contract)
        second = target.stat()
        self.assertEqual(first.st_ino, second.st_ino)
        self.assertEqual(stat.S_IMODE(second.st_mode), 0o750)
        target.chmod(0o770)
        with self.assertRaisesRegex(bootstrap.BootstrapError, "metadata mismatch"):
            bootstrap.ensure_directory(contract)

    def test_symlink_and_writable_ancestor_are_rejected(self) -> None:
        real = self.temporary / "real"
        real.mkdir(mode=0o755)
        linked = self.temporary / "linked"
        linked.symlink_to(real, target_is_directory=True)
        with self.assertRaisesRegex(bootstrap.BootstrapError, "symlinked"):
            bootstrap.ensure_directory(bootstrap.DirectoryContract(str(linked / "child"), 0, 0, 0o700))

        writable = self.temporary / "writable"
        writable.mkdir(mode=0o777)
        writable.chmod(0o777)
        with self.assertRaisesRegex(bootstrap.BootstrapError, "writable or non-root"):
            bootstrap.ensure_directory(bootstrap.DirectoryContract(str(writable / "child"), 0, 0, 0o700))

    def test_atomic_file_install_is_repeatable_and_requires_explicit_replacement(self) -> None:
        target = self.temporary / "contract"
        self.assertTrue(bootstrap.atomic_write(target, b"first\n", 0, 0, 0o600, replace=False))
        self.assertFalse(bootstrap.atomic_write(target, b"first\n", 0, 0, 0o600, replace=False))
        with self.assertRaisesRegex(bootstrap.BootstrapError, "explicit replacement"):
            bootstrap.atomic_write(target, b"second\n", 0, 0, 0o600, replace=False)
        self.assertTrue(bootstrap.atomic_write(target, b"second\n", 0, 0, 0o600, replace=True))
        self.assertEqual(target.read_bytes(), b"second\n")
        self.assertEqual(list(self.temporary.glob(".contract.*")), [])

    def test_managed_destination_failures_are_preflighted_before_any_replacement(self) -> None:
        source_root = self.temporary / "source"
        destination_root = self.temporary / "destinations"
        source_root.mkdir(mode=0o700)
        destination_root.mkdir(mode=0o700)
        sudoers_content = (
            "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: "
            "/opt/yolpol/bin/yolpol-deploy\n"
        ).encode("ascii")
        agent_sudoers_content = (
            "yolpol-deployment-agent ALL=(root) NOPASSWD:NOSETENV: "
            "/opt/yolpol/bin/yolpol-deploy apply-staging-intent, "
            "/opt/yolpol/bin/yolpol-deploy apply-production-intent\n"
        ).encode("ascii")
        (source_root / "sudoers").write_bytes(sudoers_content)
        (source_root / "agent-sudoers").write_bytes(agent_sudoers_content)
        first = destination_root / "first"
        second = destination_root / "second"
        sudoers_destination = destination_root / "installed-sudoers"
        agent_sudoers_destination = destination_root / "installed-agent-sudoers"
        second.write_bytes(b"old-second\n")
        second.chmod(0o600)
        sudoers_destination.write_bytes(sudoers_content)
        sudoers_destination.chmod(0o440)
        agent_sudoers_destination.write_bytes(agent_sudoers_content)
        agent_sudoers_destination.chmod(0o440)
        contracts = (
            bootstrap.FileContract("source-first", str(first), 0, 0, 0o600),
            bootstrap.FileContract("source-second", str(second), 0, 0, 0o600),
        )
        source_content = {
            "sudoers": sudoers_content,
            "agent-sudoers": agent_sudoers_content,
            "source-first": b"new-first\n",
            "source-second": b"new-second\n",
        }
        with (
            mock.patch.object(bootstrap, "MANAGED_FILES", contracts),
            mock.patch.object(bootstrap, "SUDOERS_SOURCE", "sudoers"),
            mock.patch.object(bootstrap, "SUDOERS_DESTINATION", sudoers_destination),
            mock.patch.object(bootstrap, "AGENT_SUDOERS_SOURCE", "agent-sudoers"),
            mock.patch.object(bootstrap, "AGENT_SUDOERS_DESTINATION", agent_sudoers_destination),
            mock.patch.object(bootstrap, "trusted_source_root", return_value=source_root),
            mock.patch.object(bootstrap, "validate_source_file", side_effect=source_content.__getitem__),
        ):
            with self.assertRaisesRegex(bootstrap.BootstrapError, "explicit replacement"):
                bootstrap.install_managed_files(replace=False)
            self.assertFalse(first.exists())
            self.assertEqual(second.read_bytes(), b"old-second\n")

            first.write_bytes(b"old-first\n")
            first.chmod(0o600)
            second.chmod(0o640)
            with self.assertRaisesRegex(bootstrap.BootstrapError, "metadata mismatch"):
                bootstrap.install_managed_files(replace=True)
            self.assertEqual(first.read_bytes(), b"old-first\n")
            self.assertEqual(second.read_bytes(), b"old-second\n")

    def test_trusted_source_requires_fixed_root_owned_nonwritable_nonsymlink_tree(self) -> None:
        source_root = self.temporary / "trusted-source"
        script = source_root / "deploy/bootstrap/yolpol-bootstrap.py"
        contract = source_root / "deploy/operations/contract"
        script.parent.mkdir(parents=True, mode=0o755)
        contract.parent.mkdir(parents=True, mode=0o755)
        source_root.chmod(0o700)
        script.write_bytes(BOOTSTRAP_PATH.read_bytes())
        contract.write_bytes(b"reviewed\n")
        script.chmod(0o644)
        contract.chmod(0o644)
        with (
            mock.patch.object(bootstrap, "TRUSTED_SOURCE_ROOT", source_root),
            mock.patch.object(bootstrap, "TRUSTED_SOURCE_SCRIPT", script),
            mock.patch.object(bootstrap, "__file__", str(script)),
        ):
            self.assertEqual(bootstrap.validate_source_file("deploy/operations/contract"), b"reviewed\n")
            source_root.chmod(0o770)
            with self.assertRaisesRegex(bootstrap.BootstrapError, "source directory metadata"):
                bootstrap.validate_source_file("deploy/operations/contract")
            source_root.chmod(0o700)
            contract.unlink()
            outside = self.temporary / "outside"
            outside.write_bytes(b"untrusted\n")
            contract.symlink_to(outside)
            with self.assertRaisesRegex(bootstrap.BootstrapError, "source file rejected"):
                bootstrap.validate_source_file("deploy/operations/contract")
            contract.unlink()
            operations = source_root / "deploy/operations"
            real_operations = source_root / "deploy/real-operations"
            operations.rename(real_operations)
            operations.symlink_to(real_operations, target_is_directory=True)
            with self.assertRaisesRegex(bootstrap.BootstrapError, "source directory rejected"):
                bootstrap.validate_source_file("deploy/operations/contract")

    def test_source_only_commands_reject_the_installed_copy_before_lock_creation(self) -> None:
        result = subprocess.run(
            [str(BOOTSTRAP_PATH), "apply"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("operation failed", result.stderr)
        self.assertFalse(Path("/run/lock/yolpol-bootstrap.lock").exists())

        with mock.patch.object(
            bootstrap,
            "validate_all_source_material",
            side_effect=bootstrap.BootstrapError("untrusted source"),
        ), mock.patch.object(bootstrap, "validate_supported_host") as host_check:
            with self.assertRaisesRegex(bootstrap.BootstrapError, "untrusted source"):
                bootstrap.bootstrap_apply(replace_contracts=False)
            host_check.assert_not_called()

    def test_secret_schema_is_closed_and_errors_never_echo_values(self) -> None:
        secret_value = "never-print-this-value"
        payload = {
            "schemaVersion": 1,
            "environment": "staging",
            "secrets": {key: secret_value for contract in bootstrap.APPLICATION_SECRETS for key in contract.keys},
        }
        parsed = bootstrap.parse_secret_payload(
            "staging",
            set(payload["secrets"]),
            io.BytesIO(json.dumps(payload).encode("utf-8")),
        )
        self.assertEqual(parsed["GROQ_API_KEY"], secret_value)

        payload["secrets"]["UNKNOWN"] = secret_value
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            with self.assertRaises(bootstrap.BootstrapError):
                bootstrap.parse_secret_payload(
                    "staging",
                    {key for contract in bootstrap.APPLICATION_SECRETS for key in contract.keys},
                    io.BytesIO(json.dumps(payload).encode("utf-8")),
                )
        self.assertNotIn(secret_value, stderr.getvalue())

    def test_secret_first_install_noop_and_explicit_rotation(self) -> None:
        secret_directory = self.temporary / "secrets"
        secret_directory.mkdir(mode=0o700)
        original_root = bootstrap.HOST_ROOT
        contracts = (
            bootstrap.SecretFile("token", 0, 0, 0o400, ("TOKEN",)),
        )
        try:
            bootstrap.HOST_ROOT = self.temporary
            with mock.patch.object(bootstrap, "secret_contracts", return_value=(secret_directory, contracts)):
                with mock.patch.object(bootstrap, "parse_secret_payload", return_value={"TOKEN": "first"}):
                    bootstrap.install_secrets("staging", rotate=False)
                    inode = (secret_directory / "token").stat().st_ino
                    bootstrap.install_secrets("staging", rotate=False)
                    self.assertEqual((secret_directory / "token").stat().st_ino, inode)
                with mock.patch.object(bootstrap, "parse_secret_payload", return_value={"TOKEN": "second"}):
                    with self.assertRaisesRegex(bootstrap.BootstrapError, "explicit rotation"):
                        bootstrap.install_secrets("staging", rotate=False)
                    bootstrap.install_secrets("staging", rotate=True)
            self.assertEqual((secret_directory / "token").read_text(encoding="ascii"), "second\n")
            self.assertEqual(stat.S_IMODE((secret_directory / "token").stat().st_mode), 0o400)
            self.assertEqual(list(secret_directory.glob(".token.*")), [])
        finally:
            bootstrap.HOST_ROOT = original_root

    def test_environment_secret_rendering_rejects_compose_ambiguous_values(self) -> None:
        contract = bootstrap.SecretFile("database.env", 0, 0, 0o400, ("APP_DATABASE_URL",), True)
        safe = "postgresql://user:p%24%23%20%5C%22%27@postgres:5432/yolpol?x=a=b&sslmode=require"
        self.assertEqual(
            bootstrap.render_secret_file(contract, {"APP_DATABASE_URL": safe}),
            f"DATABASE_URL={safe}\n".encode("ascii"),
        )
        for value in ("has$dollar", "has#hash", "has space", "has\\backslash", 'has"quote', "has'quote"):
            with self.assertRaisesRegex(bootstrap.BootstrapError, "secret input rejected"):
                bootstrap.render_secret_file(contract, {"APP_DATABASE_URL": value})

    def test_runtime_parser_rejects_unknown_duplicate_and_control_keys(self) -> None:
        valid = (
            "YOLPOL_INGRESS_CADDY_MEMORY_LIMIT=256m\n"
            "YOLPOL_INGRESS_CADDY_CPU_LIMIT=0.20\n"
            "YOLPOL_INGRESS_LOG_MAX_SIZE=10m\n"
            "YOLPOL_INGRESS_LOG_MAX_FILES=3\n"
        )
        values = policy.parse_runtime_environment_text(valid, policy.ingress_expected_keys())
        policy.validate_ingress_runtime(values)
        for addition in (
            "UNKNOWN=value\n",
            "YOLPOL_INGRESS_LOG_MAX_FILES=4\n",
            "DOCKER_HOST=tcp://attacker\n",
        ):
            with self.assertRaises(policy.PolicyError):
                policy.parse_runtime_environment_text(valid + addition, policy.ingress_expected_keys())

    def test_network_names_are_fixed_and_incompatible_models_fail(self) -> None:
        expected = {
            "Name": "yolpol-staging-ingress",
            "Driver": "bridge",
            "Scope": "local",
            "Internal": False,
            "Attachable": False,
            "ConfigOnly": False,
            "Options": {},
        }
        bootstrap.validate_network("yolpol-staging-ingress", expected)
        for key, value in (("Name", "attacker"), ("Driver", "overlay"), ("Internal", True), ("Attachable", True)):
            attacked = dict(expected)
            attacked[key] = value
            with self.assertRaises(bootstrap.BootstrapError):
                bootstrap.validate_network("yolpol-staging-ingress", attacked)
        self.assertEqual(bootstrap.NETWORK_NAMES, ("yolpol-staging-ingress", "yolpol-production-ingress"))

    def test_missing_networks_are_created_once_with_no_caller_selected_name(self) -> None:
        models: dict[str, dict[str, object]] = {}
        created: list[list[str]] = []

        def inspect(name: str):
            return models.get(name)

        def create(command: list[str], **_options):
            name = command[-1]
            created.append(command)
            models[name] = {
                "Name": name,
                "Driver": "bridge",
                "Scope": "local",
                "Internal": False,
                "Attachable": False,
                "ConfigOnly": False,
                "Options": {},
            }

        with mock.patch.object(bootstrap, "network_model", side_effect=inspect), mock.patch.object(bootstrap, "run", side_effect=create):
            bootstrap.ensure_networks()
            bootstrap.ensure_networks()
        self.assertEqual([command[-1] for command in created], list(bootstrap.NETWORK_NAMES))
        self.assertTrue(all(command[:-1] == ["/usr/bin/docker", "network", "create", "--driver", "bridge"] for command in created))

    def test_foundation_check_is_independent_from_production_readiness(self) -> None:
        base_functions = (
            "validate_supported_host", "validate_prerequisites", "validate_operator",
            "validate_deployment_agent", "validate_managed_files",
            "validate_optional_control_plane_credentials", "validate_networks",
        )
        patches = [mock.patch.object(bootstrap, name) for name in base_functions]
        with contextlib.ExitStack() as stack:
            for patcher in patches:
                stack.enter_context(patcher)
            stack.enter_context(mock.patch.object(bootstrap, "DIRECTORIES", ()))
            stack.enter_context(mock.patch.object(bootstrap, "STATE_FILES", ()))
            environment_check = stack.enter_context(mock.patch.object(bootstrap, "validate_environment_contract"))
            bootstrap.bootstrap_check()
            environment_check.assert_not_called()

        with mock.patch.object(bootstrap, "bootstrap_check"), mock.patch.object(
            bootstrap,
            "validate_environment_contract",
            side_effect=bootstrap.BootstrapError("Production is not provisioned"),
        ):
            with self.assertRaisesRegex(bootstrap.BootstrapError, "not provisioned"):
                bootstrap.bootstrap_check_environment("production")

    def test_repeated_apply_converges_without_environment_provisioning_or_service_start(self) -> None:
        with (
            mock.patch.object(bootstrap, "validate_all_source_material"),
            mock.patch.object(bootstrap, "validate_supported_host"),
            mock.patch.object(bootstrap, "install_prerequisites"),
            mock.patch.object(bootstrap, "ensure_operator"),
            mock.patch.object(bootstrap, "ensure_deployment_agent"),
            mock.patch.object(bootstrap, "ensure_directory") as ensure_directory,
            mock.patch.object(bootstrap, "ensure_state_files") as ensure_state,
            mock.patch.object(bootstrap, "install_managed_files") as install_managed,
            mock.patch.object(bootstrap, "validate_operator_sudo") as validate_sudo,
            mock.patch.object(bootstrap, "validate_agent_sudo") as validate_agent_sudo,
            mock.patch.object(bootstrap, "validate_optional_control_plane_credentials"),
            mock.patch.object(bootstrap, "ensure_networks") as ensure_networks,
            mock.patch.object(bootstrap, "command_exists", return_value=False),
        ):
            bootstrap.bootstrap_apply(replace_contracts=False)
            bootstrap.bootstrap_apply(replace_contracts=False)
        self.assertEqual(ensure_directory.call_count, len(bootstrap.DIRECTORIES) * 2)
        self.assertEqual(ensure_state.call_count, 2)
        self.assertEqual(install_managed.call_count, 2)
        self.assertEqual(validate_sudo.call_count, 2)
        self.assertEqual(validate_agent_sudo.call_count, 2)
        self.assertEqual(ensure_networks.call_count, 2)

    def test_release_authorities_are_separate(self) -> None:
        staging = bootstrap.release_paths("staging")
        production = bootstrap.release_paths("production")
        self.assertNotEqual(staging, production)
        self.assertIn("/releases/staging/active/", str(staging[0]))
        self.assertIn("/releases/production/active/", str(production[0]))
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.release_paths("caller-selected")

    def test_release_pair_failure_cannot_mix_active_authority(self) -> None:
        original_root = bootstrap.HOST_ROOT
        bootstrap.HOST_ROOT = self.temporary
        release_directory = self.temporary / "releases/staging"
        active = release_directory / "active"
        active.mkdir(parents=True, mode=0o700)
        release_directory.chmod(0o700)
        old_manifest, old_checksum = release_artifacts("0.1.7", "a" * 40)
        new_manifest, new_checksum = release_artifacts("0.1.8", "b" * 40)
        bootstrap.atomic_write(active / "release-manifest.json", old_manifest, 0, 0, 0o600, replace=False)
        bootstrap.atomic_write(active / "release-manifest.sha256", old_checksum, 0, 0, 0o600, replace=False)
        original_atomic_write = bootstrap.atomic_write

        def fail_before_second_staged_file(path, content, uid, gid, mode, *, replace):
            if ".active-staged-" in str(path.parent) and path.name == "release-manifest.sha256":
                raise bootstrap.BootstrapError("injected staged checksum failure")
            return original_atomic_write(path, content, uid, gid, mode, replace=replace)

        try:
            with mock.patch.object(bootstrap, "atomic_write", side_effect=fail_before_second_staged_file):
                with self.assertRaisesRegex(bootstrap.BootstrapError, "injected"):
                    bootstrap.activate_release_pair("staging", new_manifest, new_checksum)
            self.assertEqual((active / "release-manifest.json").read_bytes(), old_manifest)
            self.assertEqual((active / "release-manifest.sha256").read_bytes(), old_checksum)
            self.assertEqual(list(release_directory.glob(".active-staged-*")), [])

            bootstrap.activate_release_pair("staging", new_manifest, new_checksum)
            self.assertEqual((active / "release-manifest.json").read_bytes(), new_manifest)
            self.assertEqual((active / "release-manifest.sha256").read_bytes(), new_checksum)
            previous = list(release_directory.glob("previous-*"))
            self.assertEqual(len(previous), 1)
            self.assertEqual((previous[0] / "release-manifest.json").read_bytes(), old_manifest)
            self.assertEqual((previous[0] / "release-manifest.sha256").read_bytes(), old_checksum)
        finally:
            bootstrap.HOST_ROOT = original_root

    def test_operator_privileged_group_and_broader_sudo_are_rejected(self) -> None:
        bootstrap.validate_operator_sudo(allow_missing=False)
        self.assertTrue(bootstrap.is_exact_operator_sudo_rule(
            "(root) NOSETENV: NOPASSWD: /opt/yolpol/bin/yolpol-deploy"
        ))
        sudo_gid = next(entry.gr_gid for entry in __import__("grp").getgrall() if entry.gr_name == "sudo")
        with self.assertRaisesRegex(bootstrap.BootstrapError, "privileged group"):
            bootstrap.validate_operator_groups([bootstrap.OPERATOR_GID, sudo_gid])
        with self.assertRaisesRegex(bootstrap.BootstrapError, "supplementary group"):
            bootstrap.validate_operator_groups([bootstrap.OPERATOR_GID, 65534])

        sudoers_path = bootstrap.SUDOERS_DESTINATION
        valid = sudoers_path.read_bytes()
        invalid_grants = {
            "missing-no-setenv": "yolpol-operator ALL=(root) NOPASSWD: /opt/yolpol/bin/yolpol-deploy\n",
            "missing-no-passwd": "yolpol-operator ALL=(root) NOSETENV: /opt/yolpol/bin/yolpol-deploy\n",
            "setenv": "yolpol-operator ALL=(root) NOPASSWD:SETENV: /opt/yolpol/bin/yolpol-deploy\n",
            "all-command": "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: ALL\n",
            "alternate-run-as": "yolpol-operator ALL=(ALL) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy\n",
            "command-suffix": "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy *\n",
            "additional-grant": (
                "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy\n"
                "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: /usr/bin/id\n"
            ),
        }
        try:
            for name, grant in invalid_grants.items():
                with self.subTest(name=name):
                    sudoers_path.write_text(grant, encoding="ascii")
                    sudoers_path.chmod(0o440)
                    subprocess.run(
                        ["/usr/sbin/visudo", "-cf", str(sudoers_path)],
                        check=True,
                        stdout=subprocess.DEVNULL,
                    )
                    with self.assertRaisesRegex(bootstrap.BootstrapError, "broader sudo"):
                        bootstrap.validate_operator_sudo(allow_missing=False)
        finally:
            sudoers_path.write_bytes(valid)
            sudoers_path.chmod(0o440)
        bootstrap.validate_operator_sudo(allow_missing=False)

    def test_agent_sudo_tags_and_commands_are_semantically_exact(self) -> None:
        expected = {
            "/opt/yolpol/bin/yolpol-deploy apply-staging-intent",
            "/opt/yolpol/bin/yolpol-deploy apply-production-intent",
        }
        self.assertEqual(
            bootstrap.exact_agent_sudo_commands(
                "(root) NOSETENV: NOPASSWD: "
                "/opt/yolpol/bin/yolpol-deploy apply-production-intent, "
                "/opt/yolpol/bin/yolpol-deploy apply-staging-intent"
            ),
            expected,
        )
        sudoers_path = bootstrap.AGENT_SUDOERS_DESTINATION
        valid = sudoers_path.read_bytes()
        prefix = "yolpol-deployment-agent ALL=(root) "
        commands = (
            "/opt/yolpol/bin/yolpol-deploy apply-staging-intent, "
            "/opt/yolpol/bin/yolpol-deploy apply-production-intent"
        )
        invalid_grants = {
            "missing-no-setenv": f"{prefix}NOPASSWD: {commands}\n",
            "missing-no-passwd": f"{prefix}NOSETENV: {commands}\n",
            "repeated-no-passwd": f"{prefix}NOPASSWD:NOPASSWD: {commands}\n",
            "repeated-no-setenv": f"{prefix}NOSETENV:NOSETENV: {commands}\n",
            "setenv": f"{prefix}NOPASSWD:SETENV: {commands}\n",
            "all-command": f"{prefix}NOPASSWD:NOSETENV: ALL\n",
            "alternate-run-as": (
                "yolpol-deployment-agent ALL=(ALL) NOPASSWD:NOSETENV: " + commands + "\n"
            ),
            "command-suffix": (
                f"{prefix}NOPASSWD:NOSETENV: "
                "/opt/yolpol/bin/yolpol-deploy apply-staging-intent *, "
                "/opt/yolpol/bin/yolpol-deploy apply-production-intent\n"
            ),
            "additional-grant": (
                f"{prefix}NOPASSWD:NOSETENV: {commands}\n"
                f"{prefix}NOPASSWD:NOSETENV: /usr/bin/id\n"
            ),
        }
        try:
            for name, grant in invalid_grants.items():
                with self.subTest(name=name):
                    sudoers_path.write_text(grant, encoding="ascii")
                    sudoers_path.chmod(0o440)
                    subprocess.run(
                        ["/usr/sbin/visudo", "-cf", str(sudoers_path)],
                        check=True,
                        stdout=subprocess.DEVNULL,
                    )
                    with self.assertRaisesRegex(
                        bootstrap.BootstrapError, "broader sudo privilege|sudo policy is not exact",
                    ):
                        bootstrap.validate_agent_sudo(allow_missing=False)
        finally:
            sudoers_path.write_bytes(valid)
            sudoers_path.chmod(0o440)
        bootstrap.validate_agent_sudo(allow_missing=False)

    def test_recovery_secrets_are_not_normal_bootstrap_commands_or_readiness_inputs(self) -> None:
        source = BOOTSTRAP_PATH.read_text(encoding="utf-8")
        self.assertNotIn("recovery-secret-install", source)
        self.assertNotIn("recovery-secret-rotate", source)
        self.assertNotIn("backup-age-identity", source)
        self.assertNotIn("restore-database.env", source)

    def test_apply_has_no_workload_start_or_destructive_cleanup_surface(self) -> None:
        source = BOOTSTRAP_PATH.read_text(encoding="utf-8")
        self.assertNotIn("compose up", source)
        self.assertNotIn("docker compose", source)
        self.assertNotIn("network rm", source)
        self.assertNotIn("volume rm", source)
        self.assertNotIn("cloudflare", source.lower())
        self.assertNotIn("shutil.rmtree", source)


class CommandGrammarTests(unittest.TestCase):
    def run_unprivileged(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/usr/sbin/runuser", "-u", "yolpol-operator", "--", str(BOOTSTRAP_PATH), *arguments],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

    def test_supported_commands_cross_parser_then_stop_at_root_boundary(self) -> None:
        commands = (
            ("check",), ("check-staging",), ("check-production",), ("check-ingress",), ("check-monitoring",),
            ("apply",), ("refresh-contracts",),
            ("runtime-install", "staging"), ("runtime-install", "production"),
            ("runtime-install", "ingress"), ("runtime-install", "monitoring"),
            ("secret-install", "staging"), ("secret-rotate", "production"),
            ("secret-install", "monitoring"), ("release-promote", "staging"),
            ("release-promote", "production"),
        )
        for command in commands:
            result = self.run_unprivileged(*command)
            self.assertEqual(result.returncode, 1, (command, result.stderr))
            self.assertIn("operation failed", result.stderr)

    def test_unknown_commands_environments_and_extra_arguments_are_rejected(self) -> None:
        secret_marker = "must-never-be-echoed"
        commands = (
            (), ("unknown",), ("apply", "extra"), ("runtime-install", "development"),
            ("secret-install", "ingress"), ("release-promote", "monitoring"),
            ("recovery-secret-install", "staging"),
            ("secret-install", "staging", secret_marker),
        )
        for command in commands:
            result = self.run_unprivileged(*command)
            self.assertEqual(result.returncode, 2, (command, result.stderr))
            self.assertNotIn(secret_marker, result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
