#!/usr/bin/python3
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch


ROOT = Path(__file__).resolve().parents[2]
CONTROL_PLANE = ROOT / "deploy/control-plane"
sys.path.insert(0, str(CONTROL_PLANE))

import yolpol_control_plane as control  # noqa: E402

controller_spec = importlib.util.spec_from_file_location(
    "yolpol_release_controller", CONTROL_PLANE / "yolpol-release-controller.py",
)
if controller_spec is None or controller_spec.loader is None:
    raise RuntimeError("Unable to load release controller")
controller = importlib.util.module_from_spec(controller_spec)
controller_spec.loader.exec_module(controller)

agent_spec = importlib.util.spec_from_file_location(
    "yolpol_deployment_agent", CONTROL_PLANE / "yolpol-deployment-agent.py",
)
if agent_spec is None or agent_spec.loader is None:
    raise RuntimeError("Unable to load deployment agent")
agent = importlib.util.module_from_spec(agent_spec)
fcntl_stub = types.ModuleType("fcntl")
fcntl_stub.LOCK_EX = 2  # type: ignore[attr-defined]
fcntl_stub.LOCK_NB = 4  # type: ignore[attr-defined]
fcntl_stub.flock = lambda descriptor, operation: None  # type: ignore[attr-defined]
pwd_stub = types.ModuleType("pwd")
pwd_stub.getpwuid = lambda uid: None  # type: ignore[attr-defined]
with patch.dict(sys.modules, {"fcntl": fcntl_stub, "pwd": pwd_stub}):
    agent_spec.loader.exec_module(agent)


def config() -> control.HostConfig:
    staging = control.EnvironmentTrust(
        subject="repo:farhadesmaeili/YolPol:environment:staging",
        workflow_ref="farhadesmaeili/YolPol/.github/workflows/release.yml@refs/tags/{releaseTag}",
        job_workflow_ref="farhadesmaeili/YolPol/.github/workflows/deploy-release.yml@refs/tags/{releaseTag}",
        event_name="push",
        ref="refs/tags/{releaseTag}",
        capability_key_id="staging-key",
        capability_private_key_file="/etc/yolpol/control-plane/staging-capability-private.pem",
    )
    production = control.EnvironmentTrust(
        subject="repo:farhadesmaeili/YolPol:environment:production",
        workflow_ref="farhadesmaeili/YolPol/.github/workflows/promote-production.yml@refs/heads/develop",
        job_workflow_ref="farhadesmaeili/YolPol/.github/workflows/deploy-release.yml@refs/heads/develop",
        event_name="workflow_dispatch",
        ref="refs/heads/develop",
        capability_key_id="production-key",
        capability_private_key_file="/etc/yolpol/control-plane/production-capability-private.pem",
    )
    return control.HostConfig(
        repository="farhadesmaeili/YolPol",
        repository_id="123456789012345678",
        repository_owner="farhadesmaeili",
        repository_owner_id="987654321098765432",
        app_id="12345",
        installation_id="67890",
        app_private_key_file="/etc/yolpol/control-plane/github-app-private.pem",
        staging=staging,
        production=production,
    )


def body(now: int = 1_780_000_000) -> bytes:
    value = {
        "protocolVersion": 1,
        "operation": "deploy-release",
        "repository": "farhadesmaeili/YolPol",
        "repositoryId": "123456789012345678",
        "repositoryOwner": "farhadesmaeili",
        "repositoryOwnerId": "987654321098765432",
        "environment": "staging",
        "releaseTag": "v0.1.7",
        "gitSha": "a" * 40,
        "manifestSha256": "b" * 64,
        "workflowRunId": "123456789012345678",
        "workflowRunAttempt": 1,
        "workflowRef": "farhadesmaeili/YolPol/.github/workflows/release.yml@refs/tags/v0.1.7",
        "workflowSha": "a" * 40,
        "jobWorkflowRef": "farhadesmaeili/YolPol/.github/workflows/deploy-release.yml@refs/tags/v0.1.7",
        "jobWorkflowSha": "a" * 40,
        "eventName": "push",
        "ref": "refs/tags/v0.1.7",
        "issuedAtUnix": now,
        "expiresAtUnix": now + 300,
        "nonce": "c" * 43,
        "capability": {
            "type": "github-actions-token",
            "keyId": "staging-key",
            "algorithm": "rsa-oaep-sha256",
            "ciphertext": "d" * 512,
        },
    }
    return json.dumps(value, separators=(",", ":"), sort_keys=False).encode()


def jwt(claims: dict[str, object], *, kid: str | None = "key-1", header_extra: dict[str, object] | None = None) -> str:
    header = {"alg": "RS256", "typ": "JWT", **({"kid": kid} if kid is not None else {}), **(header_extra or {})}
    return ".".join((
        control.b64url_encode(json.dumps(header, separators=(",", ":")).encode()),
        control.b64url_encode(json.dumps(claims, separators=(",", ":")).encode()),
        control.b64url_encode(b"signature"),
    ))


def envelope(
    now: int = 1_780_000_000,
    overrides: dict[str, object] | None = None,
    *,
    header_extra: dict[str, object] | None = None,
    kid: str | None = "key-1",
    missing_claims: tuple[str, ...] = (),
) -> control.Envelope:
    raw = body(now)
    digest = hashlib.sha256(raw).hexdigest()
    claims: dict[str, object] = {
        "iss": control.OIDC_ISSUER,
        "aud": f"{control.OIDC_AUDIENCE_PREFIX}{digest}",
        "repository": "farhadesmaeili/YolPol",
        "repository_id": "123456789012345678",
        "repository_owner": "farhadesmaeili",
        "repository_owner_id": "987654321098765432",
        "environment": "staging",
        "sub": "repo:farhadesmaeili/YolPol:environment:staging",
        "workflow_ref": "farhadesmaeili/YolPol/.github/workflows/release.yml@refs/tags/v0.1.7",
        "job_workflow_ref": "farhadesmaeili/YolPol/.github/workflows/deploy-release.yml@refs/tags/v0.1.7",
        "workflow_sha": "a" * 40,
        "job_workflow_sha": "a" * 40,
        "event_name": "push",
        "ref": "refs/tags/v0.1.7",
        "run_id": "123456789012345678",
        "run_attempt": "1",
        "runner_environment": "github-hosted",
        "actor": "farhadesmaeili",
        "actor_id": "24680",
        "jti": "unique-jti",
        "iat": now + 1,
        "nbf": now - 1,
        "exp": now + 300,
    }
    claims.update(overrides or {})
    for claim in missing_claims:
        claims.pop(claim, None)
    value = {"intentBody": control.b64url_encode(raw), "oidcJwt": jwt(claims, kid=kid, header_extra=header_extra)}
    return control.parse_envelope(value, expected_repository="farhadesmaeili/YolPol")


def oidc_transport(method: str, url: str, headers: dict[str, str], data: bytes | None) -> control.HttpResponse:
    del method, headers, data
    if url == control.OIDC_CONFIGURATION_URL:
        return control.HttpResponse(200, {}, json.dumps({
            "issuer": control.OIDC_ISSUER,
            "jwks_uri": f"{control.OIDC_ISSUER}/.well-known/jwks",
        }, separators=(",", ":")).encode())
    if url == f"{control.OIDC_ISSUER}/.well-known/jwks":
        return control.HttpResponse(200, {}, b'{"keys":[{"kid":"key-1","kty":"RSA","use":"sig","alg":"RS256","x5c":["Y2VydA=="]}]}')
    raise AssertionError(url)


class ModuleLoadingTests(unittest.TestCase):
    def test_real_bootstrap_dataclasses_load_successfully(self) -> None:
        module_name = "yolpol_test_bootstrap_module"
        self.assertNotIn(module_name, sys.modules)
        fcntl_stub = types.ModuleType("fcntl")
        grp_stub = types.ModuleType("grp")
        pwd_stub = types.ModuleType("pwd")

        with patch.dict(sys.modules, {"fcntl": fcntl_stub, "grp": grp_stub, "pwd": pwd_stub}):
            try:
                bootstrap = controller.load_python(
                    ROOT / "deploy/bootstrap/yolpol-bootstrap.py",
                    module_name,
                )
                self.assertIs(sys.modules[module_name], bootstrap)
                self.assertEqual(bootstrap.SupportedHost.__module__, module_name)
                self.assertEqual(
                    tuple(bootstrap.SupportedHost.__dataclass_fields__),
                    ("os_id", "version_id", "version_codename", "docker_repository_base"),
                )
                self.assertIsInstance(bootstrap.SUPPORTED_HOSTS[0], bootstrap.SupportedHost)
            finally:
                sys.modules.pop(module_name, None)

    def test_failed_execution_does_not_leak_partial_module(self) -> None:
        module_name = "yolpol_test_failed_module"
        self.assertNotIn(module_name, sys.modules)
        self.addCleanup(sys.modules.pop, module_name, None)

        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "failed-module.py"
            source.write_text("raise RuntimeError('expected loader failure')\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "expected loader failure"):
                controller.load_python(source, module_name)

        self.assertNotIn(module_name, sys.modules)

    def test_failed_execution_restores_prior_module(self) -> None:
        module_name = "yolpol_test_existing_module"
        self.assertNotIn(module_name, sys.modules)
        previous = types.ModuleType(module_name)
        sys.modules[module_name] = previous
        self.addCleanup(sys.modules.pop, module_name, None)

        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "failed-module.py"
            source.write_text("raise RuntimeError('expected loader failure')\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "expected loader failure"):
                controller.load_python(source, module_name)

        self.assertIs(sys.modules[module_name], previous)


class ProtocolTests(unittest.TestCase):
    def test_exact_bytes_are_hashed_without_reserialization(self) -> None:
        raw = body()
        parsed = control.parse_intent_body(raw)
        self.assertEqual(parsed.raw, raw)
        self.assertEqual(parsed.digest, hashlib.sha256(raw).hexdigest())
        self.assertNotIn(b"oidcJwt", raw)
        self.assertNotIn(b"deploymentId", raw)

    def test_duplicate_unknown_trailing_and_whitespace_are_rejected(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            control.parse_intent_body(body().replace(b'"protocolVersion":1', b'"protocolVersion":1,"protocolVersion":1'))
        value = json.loads(body())
        value["unknown"] = True
        with self.assertRaises(control.ControlPlaneError):
            control.parse_intent_body(json.dumps(value, separators=(",", ":")).encode())
        for value in (body() + b"x", b" " + body(), body() + b"\n"):
            with self.assertRaises(control.ControlPlaneError):
                control.parse_intent_body(value)

    def test_malformed_and_oversized_base64url_are_rejected(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            control.parse_envelope({"intentBody": "a=", "oidcJwt": "a.b.c"})
        with self.assertRaises(control.ControlPlaneError):
            control.parse_intent_body(b"{" + b"x" * control.MAX_INTENT_BYTES + b"}")
        with self.assertRaises(control.ControlPlaneError):
            control.parse_submission(
                b"{" + b"x" * control.MAX_ENVELOPE_BYTES + b"}",
                expected_environment="staging", expected_repository="farhadesmaeili/YolPol",
            )


class JsonParsingBoundaryTests(unittest.TestCase):
    @staticmethod
    def github_response(body: bytes) -> dict[str, object]:
        return control._json_response(
            control.HttpResponse(200, {}, body),
            expected_status=200,
            label="GitHub test response",
        )

    def test_github_json_response_with_trailing_newline_succeeds(self) -> None:
        self.assertEqual(self.github_response(b'{"value":1}\n'), {"value": 1})

    def test_github_json_response_with_standard_whitespace_succeeds(self) -> None:
        self.assertEqual(
            self.github_response(b' \t\r\n{\n  "value": 1\n}\r\n\t '),
            {"value": 1},
        )

    def test_external_json_rejects_invalid_json_and_non_object_values(self) -> None:
        for value in (b'{"value":}', b'{"value":1} trailing', b'[]'):
            with self.subTest(value=value), self.assertRaises(control.ControlPlaneError):
                self.github_response(value)

    def test_external_json_rejects_duplicate_keys(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            self.github_response(b'{"value":1,"value":2}')

    def test_external_json_preserves_maximum_size_limit(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            self.github_response(b"{" + b"x" * control.MAX_HTTP_BYTES + b"}")

    def test_internal_strict_json_still_rejects_forbidden_whitespace(self) -> None:
        for value in (b' {"value":1}', b'{"value":1} ', b'{"value":1}\n'):
            with self.subTest(value=value), self.assertRaises(control.ControlPlaneError):
                control.strict_json(value, maximum=1_024, label="trusted local JSON")


class OidcTests(unittest.TestCase):
    def verify(self, value: control.Envelope, now: int = 1_780_000_010) -> dict[str, object]:
        return control.verify_oidc(
            value, config(), transport=oidc_transport, now=now,
            signature_verifier=lambda signing, signature, certificate: None,
        )

    def test_valid_exact_claims(self) -> None:
        self.assertEqual(self.verify(envelope())["jti"], "unique-jti")

    def test_audience_array_prefix_suffix_and_substring_are_rejected(self) -> None:
        valid = f"{control.OIDC_AUDIENCE_PREFIX}{hashlib.sha256(body()).hexdigest()}"
        for audience in ([valid], f"prefix-{valid}", f"{valid}-suffix", valid[1:]):
            with self.assertRaises(control.ControlPlaneError):
                self.verify(envelope(overrides={"aud": audience}))

    def test_wrong_security_claims_are_rejected(self) -> None:
        cases = {
            "iss": "https://attacker.invalid",
            "repository": "attacker/repo",
            "repository_id": "1",
            "repository_owner": "attacker",
            "repository_owner_id": "1",
            "environment": "production",
            "sub": "wrong",
            "workflow_ref": "wrong",
            "job_workflow_ref": "wrong",
            "workflow_sha": "f" * 40,
            "job_workflow_sha": "f" * 40,
            "event_name": "pull_request",
            "ref": "refs/heads/main",
            "run_id": "1",
            "run_attempt": "2",
            "runner_environment": "self-hosted",
        }
        for key, value in cases.items():
            with self.subTest(key=key), self.assertRaises(control.ControlPlaneError):
                self.verify(envelope(overrides={key: value}))

    def test_expired_future_and_critical_tokens_are_rejected(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(overrides={"exp": 1_780_000_001}))
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(overrides={"nbf": 1_780_001_000}))
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(header_extra={"crit": ["unknown"]}))

    def test_wrong_or_missing_key_is_rejected(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(kid="missing"))
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(kid=None))

    def test_wrong_algorithm_and_type_are_rejected(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(header_extra={"alg": "ES256"}))
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(header_extra={"typ": "at+jwt"}))

    def test_optional_x5t_must_match_first_x5c_certificate(self) -> None:
        thumbprint = control.b64url_encode(hashlib.sha1(b"cert", usedforsecurity=False).digest())
        self.assertEqual(self.verify(envelope(header_extra={"x5t": thumbprint}))["jti"], "unique-jti")
        for value in (
            control.b64url_encode(hashlib.sha1(b"other", usedforsecurity=False).digest()),
            "malformed=",
            control.b64url_encode(b"short"),
        ):
            with self.subTest(value=value), self.assertRaises(control.ControlPlaneError):
                self.verify(envelope(header_extra={"x5t": value}))

    def test_unknown_headers_and_critical_extensions_are_rejected(self) -> None:
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(header_extra={"unknown": "value"}))
        with self.assertRaises(control.ControlPlaneError):
            self.verify(envelope(header_extra={"crit": ["x5t"], "x5t": "value"}))

    def test_actor_and_actor_id_are_required_and_validated(self) -> None:
        for value in (
            envelope(missing_claims=("actor",)),
            envelope(missing_claims=("actor_id",)),
            envelope(overrides={"actor": "attacker name"}),
            envelope(overrides={"actor_id": "0"}),
            envelope(overrides={"actor_id": "not-decimal"}),
        ):
            with self.assertRaises(control.ControlPlaneError):
                self.verify(value)


class DeploymentObjectTests(unittest.TestCase):
    def model(self) -> tuple[dict[str, object], control.Envelope]:
        value = envelope()
        deployment_id = "123"
        model: dict[str, object] = {
            "id": 123,
            "payload": {"intentBody": value.intent_encoded, "oidcJwt": value.oidc_jwt},
            "repository_url": "https://api.github.com/repos/farhadesmaeili/YolPol",
            "ref": "a" * 40,
            "sha": "a" * 40,
            "task": control.DEPLOYMENT_TASK,
            "environment": "staging",
            "description": control.DEPLOYMENT_DESCRIPTION,
            "statuses_url": "https://api.github.com/repos/farhadesmaeili/YolPol/deployments/123/statuses",
            "transient_environment": False,
            "production_environment": False,
            "creator": {"login": "github-actions[bot]", "type": "Bot"},
            "created_at": "2026-05-28T20:26:41Z",
        }
        return model, value

    def test_exact_deployment_is_accepted(self) -> None:
        model, value = self.model()
        control.validate_deployment_object(model, "123", value, config())

    def test_mismatches_are_rejected(self) -> None:
        for key, replacement in {
            "id": 124,
            "repository_url": "https://api.github.com/repos/attacker/repo",
            "ref": "f" * 40,
            "sha": "f" * 40,
            "task": "deploy",
            "environment": "production",
            "production_environment": True,
            "created_at": "2020-01-01T00:00:00Z",
            "statuses_url": "https://api.github.com/repos/attacker/repo/deployments/123/statuses",
        }.items():
            model, value = self.model()
            model[key] = replacement
            with self.subTest(key=key), self.assertRaises(control.ControlPlaneError):
                control.validate_deployment_object(model, "123", value, config())
        model, value = self.model()
        model["payload"] = {**model["payload"], "extra": True}  # type: ignore[arg-type]
        with self.assertRaises(control.ControlPlaneError):
            control.validate_deployment_object(model, "123", value, config())
        for key, replacement in {
            "description": "attacker selected",
            "transient_environment": True,
            "creator": {"login": "attacker", "type": "User"},
        }.items():
            model, value = self.model()
            model[key] = replacement
            with self.subTest(key=key), self.assertRaises(control.ControlPlaneError):
                control.validate_deployment_object(model, "123", value, config())


class GitHubAppTests(unittest.TestCase):
    @staticmethod
    def token_response(**overrides: object) -> bytes:
        value: dict[str, object] = {
            "token": "installation-token",
            "expires_at": "2026-05-28T21:26:40Z",
            "permissions": {"deployments": "read"},
            "repository_selection": "selected",
            "repositories": [{"id": 123456789012345678, "full_name": "farhadesmaeili/YolPol"}],
        }
        value.update(overrides)
        return json.dumps(value, separators=(",", ":")).encode()

    def test_polling_is_fixed_read_only_conditional_and_refreshes_tokens(self) -> None:
        requests: list[tuple[str, str, dict[str, str], bytes | None]] = []

        def transport(method: str, url: str, headers: dict[str, str], data: bytes | None) -> control.HttpResponse:
            requests.append((method, url, headers, data))
            if method == "POST":
                return control.HttpResponse(201, {}, self.token_response())
            return control.HttpResponse(304, {"etag": "fixed"}, b"")

        client = control.GitHubAppClient(config(), transport=transport)
        with (
            patch.object(control, "sign_github_app_jwt", return_value="app.jwt.signature"),
            patch.object(control.time, "time", return_value=1_780_000_000),
        ):
            client.list_deployments("staging", etag='"etag"')
        self.assertEqual(requests[0][0], "POST")
        self.assertEqual(requests[0][3], (
            b'{"repository_ids":[123456789012345678],"permissions":{"deployments":"read"}}'
        ))
        self.assertEqual(requests[1][0], "GET")
        self.assertIn("/repos/farhadesmaeili/YolPol/deployments?", requests[1][1])
        self.assertEqual(requests[1][2]["If-None-Match"], '"etag"')
        self.assertNotIn("PAT", " ".join(requests[1][2].values()))

    def test_rate_limit_retry_is_bounded(self) -> None:
        self.assertEqual(control.retry_delay({"Retry-After": "30"}, 1, now=100), 30)
        self.assertEqual(control.retry_delay({"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "200"}, 1, now=100), 105)
        self.assertLessEqual(control.retry_delay({}, 100, now=100), 900)

    def test_installation_token_is_refreshed_before_expiry(self) -> None:
        issued = 0

        def transport(method: str, url: str, headers: dict[str, str], data: bytes | None) -> control.HttpResponse:
            nonlocal issued
            del url, headers, data
            self.assertEqual(method, "POST")
            issued += 1
            expiry = "2026-05-28T21:26:40Z" if issued == 1 else "2026-05-28T22:26:40Z"
            return control.HttpResponse(201, {}, self.token_response(token=f"token-{issued}", expires_at=expiry))

        client = control.GitHubAppClient(config(), transport=transport)
        with patch.object(control, "sign_github_app_jwt", return_value="app.jwt.signature"):
            self.assertEqual(client.installation_token(now=1_780_000_000), "token-1")
            self.assertEqual(client.installation_token(now=1_780_000_100), "token-1")
            self.assertEqual(client.installation_token(now=1_780_003_500), "token-2")
        self.assertEqual(issued, 2)

    def test_installation_token_rejects_broader_or_malformed_contracts(self) -> None:
        cases = {
            "missing-token": {"token": None},
            "empty-token": {"token": ""},
            "missing-expiry": {"expires_at": None},
            "invalid-expiry-type": {"expires_at": 123},
            "missing-permissions": {"permissions": None},
            "write-deployments": {"permissions": {"deployments": "write"}},
            "additional-permission": {"permissions": {"deployments": "read", "contents": "read"}},
            "all-repositories": {"repository_selection": "all"},
            "additional-repository": {"repositories": [
                {"id": 123456789012345678, "full_name": "farhadesmaeili/YolPol"},
                {"id": 2, "full_name": "farhadesmaeili/Other"},
            ]},
            "wrong-repository-id": {"repositories": [
                {"id": 2, "full_name": "farhadesmaeili/YolPol"},
            ]},
            "wrong-repository-name": {"repositories": [
                {"id": 123456789012345678, "full_name": "farhadesmaeili/Other"},
            ]},
            "excessive-lifetime": {"expires_at": "2026-05-28T22:26:41Z"},
        }
        for name, overrides in cases.items():
            value = json.loads(self.token_response())
            if overrides.get("token") is None and "token" in overrides:
                del value["token"]
            elif overrides.get("expires_at") is None and "expires_at" in overrides:
                del value["expires_at"]
            else:
                value.update(overrides)
            client = control.GitHubAppClient(
                config(),
                transport=lambda method, url, headers, data, response=value: control.HttpResponse(
                    201, {}, json.dumps(response, separators=(",", ":")).encode(),
                ),
            )
            with self.subTest(name=name), patch.object(control, "sign_github_app_jwt", return_value="app.jwt.signature"):
                with self.assertRaises(control.ControlPlaneError):
                    client.installation_token(now=1_780_000_000)


class PollingAgentTests(unittest.TestCase):
    @staticmethod
    def state() -> dict[str, object]:
        return {
            "schemaVersion": 1,
            "failures": 0,
            "nextPollUnix": 0,
            "etags": {"staging": '"old"'},
            "seen": [],
        }

    def test_controller_exit_codes_map_to_closed_outcomes(self) -> None:
        deployment = {"id": 1, "payload": {}}
        for returncode, expected in (
            (control.CONTROLLER_HANDLED_EXIT, agent.HANDLED),
            (control.CONTROLLER_TERMINAL_REJECT_EXIT, agent.TERMINAL_REJECT),
            (control.CONTROLLER_RETRYABLE_EXIT, agent.RETRYABLE),
            (99, agent.RETRYABLE),
        ):
            with self.subTest(returncode=returncode), patch.object(
                agent.subprocess, "run", return_value=Mock(returncode=returncode),
            ):
                self.assertEqual(agent.invoke_controller(deployment, "staging"), expected)

    def test_retryable_first_controller_keeps_previous_etag_for_retry(self) -> None:
        state = self.state()
        client = Mock()
        client.list_deployments.return_value = control.HttpResponse(
            200, {"etag": '"candidate"'}, b'[{"id":1,"payload":{}}]',
        )
        with (
            patch.object(agent, "invoke_controller", return_value=agent.RETRYABLE),
            patch.object(agent, "atomic_state") as persist,
        ):
            with self.assertRaises(control.ControlPlaneError):
                agent.poll_environment(client, state, "staging")
        self.assertEqual(state["etags"], {"staging": '"old"'})
        self.assertEqual(state["seen"], [])
        persist.assert_not_called()

    def test_retryable_entry_does_not_stop_later_page_entries_and_is_retried(self) -> None:
        state = self.state()
        response = control.HttpResponse(
            200, {"etag": '"candidate"'}, b'[{"id":2,"payload":{}},{"id":1,"payload":{}}]',
        )
        client = Mock()
        client.list_deployments.return_value = response
        attempted: list[int] = []

        def first_attempt(deployment: dict[str, object], environment: str) -> str:
            del environment
            attempted.append(int(deployment["id"]))
            if deployment["id"] == 2:
                return agent.RETRYABLE
            return agent.HANDLED

        with patch.object(agent, "invoke_controller", side_effect=first_attempt), patch.object(agent, "atomic_state"):
            with self.assertRaises(control.ControlPlaneError):
                agent.poll_environment(client, state, "staging")
        self.assertEqual(attempted, [1, 2])
        self.assertEqual(state["seen"], ["1"])
        self.assertEqual(state["etags"], {"staging": '"old"'})

        attempted.clear()
        def retry(deployment: dict[str, object], environment: str) -> str:
            del environment
            attempted.append(int(deployment["id"]))
            return agent.HANDLED

        with patch.object(agent, "invoke_controller", side_effect=retry), patch.object(agent, "atomic_state"):
            agent.poll_environment(client, state, "staging")
        self.assertEqual(attempted, [2])
        self.assertEqual(state["seen"], ["1", "2"])
        self.assertEqual(state["etags"], {"staging": '"candidate"'})

    def test_expired_terminal_rejection_does_not_poison_following_valid_entry(self) -> None:
        state = self.state()
        client = Mock()
        client.list_deployments.return_value = control.HttpResponse(
            200, {"etag": '"candidate"'}, b'[{"id":2,"payload":{}},{"id":1,"payload":{}}]',
        )
        with (
            patch.object(agent, "invoke_controller", side_effect=[agent.TERMINAL_REJECT, agent.HANDLED]) as invoke,
            patch.object(agent, "atomic_state"),
        ):
            agent.poll_environment(client, state, "staging")
        self.assertEqual([call.args[0]["id"] for call in invoke.call_args_list], [1, 2])
        self.assertEqual(state["seen"], ["1", "2"])
        self.assertEqual(state["etags"], {"staging": '"candidate"'})

    def test_malformed_submission_is_terminal_and_later_entry_is_processed(self) -> None:
        state = self.state()
        client = Mock()
        client.list_deployments.return_value = control.HttpResponse(
            200, {"etag": '"candidate"'}, b'[{"id":2,"payload":{}},{"id":1,"payload":{}}]',
        )
        with (
            patch.object(
                agent,
                "invoke_controller",
                side_effect=[control.ControlPlaneError("malformed submission"), agent.HANDLED],
            ),
            patch.object(agent, "atomic_state"),
        ):
            agent.poll_environment(client, state, "staging")
        self.assertEqual(state["seen"], ["1", "2"])
        self.assertEqual(state["etags"], {"staging": '"candidate"'})

    def test_permanent_rejection_does_not_enter_global_backoff(self) -> None:
        state = self.state()
        state.update({"failures": 6, "nextPollUnix": 0})
        lock = Mock()
        lock.fileno.return_value = 9
        lock_path = MagicMock()
        lock_path.open.return_value.__enter__.return_value = lock
        with (
            patch.object(agent, "LOCK_PATH", lock_path),
            patch.object(agent, "load_host_config", return_value=config()),
            patch.object(agent, "validate_identity"),
            patch.object(agent, "load_state", return_value=state),
            patch.object(agent, "GitHubAppClient", return_value=Mock()),
            patch.object(agent, "poll_environment") as poll,
            patch.object(agent, "atomic_state"),
            patch.object(agent.time, "time", return_value=1_780_000_000),
            patch.object(sys, "argv", ["yolpol-deployment-agent"]),
        ):
            agent.main()
        self.assertEqual(poll.call_count, 2)
        self.assertEqual(state["failures"], 0)
        self.assertEqual(state["nextPollUnix"], 1_780_000_015)


class LedgerAndRollbackTests(unittest.TestCase):
    def identity(self, *, deployment_id: str = "123", manifest: str = "b" * 64) -> dict[str, object]:
        value = envelope()
        identity = controller.record_identity(deployment_id, value, {"jti": "unique-jti"})
        identity["manifestSha256"] = manifest
        return identity

    def test_exact_retry_conflict_success_and_in_progress_are_distinct(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            record, mode = controller.begin_record(ledger, self.identity(), None)
            self.assertEqual(mode, "new")
            self.assertEqual(record["migrationState"], "never-started")
            self.assertEqual(controller.begin_record(ledger, self.identity(), None)[1], "replay")

            conflict = self.identity(deployment_id="124")
            conflict["jti"] = "different-jti"
            conflict["nonce"] = "e" * 43
            conflict["intentSha256"] = "f" * 64
            with self.assertRaises(control.ControlPlaneError):
                controller.begin_record(ledger, {**conflict, "deploymentId": "123"}, None)

            record["localOutcome"] = "success"
            exact_target = self.identity(deployment_id="126")
            exact_target["jti"] = "another-jti"
            exact_target["nonce"] = "f" * 43
            exact_target["intentSha256"] = "a" * 64
            self.assertEqual(controller.begin_record(ledger, exact_target, None)[1], "already-successful")

    def test_reused_jti_nonce_or_digest_is_rejected(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            controller.begin_record(ledger, self.identity(), None)
            for key in ("jti", "nonce", "intentSha256"):
                candidate = self.identity(deployment_id="999", manifest="c" * 64)
                candidate["jti"] = "new-jti"
                candidate["nonce"] = "e" * 43
                candidate["intentSha256"] = "f" * 64
                candidate[key] = self.identity()[key]
                with self.subTest(key=key), self.assertRaises(control.ControlPlaneError):
                    controller.begin_record(ledger, candidate, None)

    def test_changed_migration_never_rolls_back_after_start(self) -> None:
        self.assertEqual(controller.rollback_disposition(True, "never-started"), "restore-previous")
        for state in ("started", "completed", "failed"):
            self.assertEqual(controller.rollback_disposition(True, state), "manual-review")
        for state in ("never-started", "started", "completed", "failed"):
            self.assertEqual(controller.rollback_disposition(False, state), "restore-previous")
        with self.assertRaises(control.ControlPlaneError):
            controller.rollback_disposition(True, "unknown")

    def test_failed_changed_migration_blocks_a_different_manifest_request(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            prior, _ = controller.begin_record(ledger, self.identity(), None)
            prior.update({
                "phase": "manual-review",
                "migrationState": "failed",
                "localOutcome": "failure",
                "result": "migration or post-migration deployment failed; manual review required",
            })
            candidate = self.identity(deployment_id="124", manifest="c" * 64)
            candidate.update({"jti": "new-jti", "nonce": "e" * 43, "intentSha256": "c" * 64})
            blocked, mode = controller.begin_record(ledger, candidate, None)
        self.assertEqual(mode, "manual-database-review")
        self.assertEqual(blocked["phase"], "manual-review-blocked")
        self.assertEqual(blocked["localOutcome"], "failure")
        self.assertEqual(blocked["result"], controller.MANUAL_DATABASE_REVIEW_RESULT)

    def test_completed_migration_failure_allows_target_application_retry_without_migration(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            prior, _ = controller.begin_record(ledger, self.identity(), None)
            prior.update({
                "phase": "application-deployed",
                "migrationState": "completed",
                "localOutcome": "failure",
                "result": "target application readiness failed",
            })
            candidate = self.identity(deployment_id="124")
            candidate.update({"jti": "new-jti", "nonce": "e" * 43, "intentSha256": "c" * 64})
            record, mode = controller.begin_record(ledger, candidate, None)
        self.assertEqual(mode, "new")

        target = {
            "database": {"latestMigration": "0023", "migrationSetSha256": "d" * 64},
        }
        current = {
            "manifest": target,
            "manifestBytes": b"current-manifest",
            "checksumBytes": b"current-checksum",
            "sha256": "b" * 64,
            "migrationFingerprint": f"0023:{'d' * 64}",
        }
        actions: list[str] = []

        def run_internal(action: str, **kwargs: object) -> bytes:
            del kwargs
            actions.append(action)
            return b""

        with (
            patch.object(controller, "persist_ledger"),
            patch.object(controller, "load_python", return_value=Mock()),
            patch.object(controller, "current_authority", return_value=current),
            patch.object(controller, "authenticate_release", return_value=(b"target-manifest", b"target-checksum", target)),
            patch.object(controller, "target_runtimes", return_value={}),
            patch.object(controller, "journal_snapshot", return_value=Path("/tmp/journal")),
            patch.object(controller, "activate"),
            patch.object(controller, "docker_auth", return_value=(Path("/tmp/request"), Path("/tmp/docker"))),
            patch.object(controller, "internal", side_effect=run_internal),
            patch.object(controller.shutil, "rmtree"),
        ):
            result = controller.execute_transaction(
                config(), "124", envelope(), {"jti": "new-jti", "actor": "farhadesmaeili"},
                b"token", ledger, record, mode,
            )
        self.assertEqual(result, "deployed")
        self.assertNotIn("migrate-staging", actions)
        self.assertIn("deploy-app-staging", actions)
        self.assertIn("deploy-workers-staging", actions)

    def test_same_fingerprint_pre_migration_failure_is_retryable(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            prior, _ = controller.begin_record(ledger, self.identity(), None)
            prior.update({"phase": "images-pulled", "migrationState": "never-started", "localOutcome": "failure"})
            candidate = self.identity(deployment_id="124")
            candidate.update({"jti": "new-jti", "nonce": "e" * 43, "intentSha256": "c" * 64})
            self.assertEqual(controller.begin_record(ledger, candidate, None)[1], "new")

    def test_stale_in_progress_record_does_not_start_a_second_transaction(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            controller.begin_record(ledger, self.identity(), None)
            candidate = self.identity(deployment_id="124", manifest="c" * 64)
            candidate.update({"jti": "new-jti", "nonce": "e" * 43, "intentSha256": "c" * 64})
            record, mode = controller.begin_record(ledger, candidate, None)
        self.assertEqual(mode, "manual-deployment-reconciliation")
        self.assertEqual(record["deploymentId"], "124")
        self.assertEqual(record["result"], controller.MANUAL_DEPLOYMENT_RECONCILIATION_RESULT)

    def test_started_migration_in_progress_requires_manual_database_review(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            prior, _ = controller.begin_record(ledger, self.identity(), None)
            prior.update({"phase": "migration-starting", "migrationState": "started"})
            candidate = self.identity(deployment_id="124", manifest="c" * 64)
            candidate.update({"jti": "new-jti", "nonce": "e" * 43, "intentSha256": "c" * 64})
            blocked, mode = controller.begin_record(ledger, candidate, None)
        self.assertEqual(mode, "manual-database-review")
        self.assertEqual(blocked["result"], controller.MANUAL_DATABASE_REVIEW_RESULT)

    def test_rollback_failure_blocks_a_different_manifest_request(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            prior, _ = controller.begin_record(ledger, self.identity(), None)
            prior.update({"phase": "rollback-failed", "migrationState": "never-started", "localOutcome": "failure"})
            candidate = self.identity(deployment_id="124", manifest="c" * 64)
            candidate.update({"jti": "new-jti", "nonce": "e" * 43, "intentSha256": "c" * 64})
            blocked, mode = controller.begin_record(ledger, candidate, None)
        self.assertEqual(mode, "manual-deployment-reconciliation")
        self.assertEqual(blocked["result"], controller.MANUAL_DEPLOYMENT_RECONCILIATION_RESULT)

    def test_successful_manifest_deduplicates_itself_without_blocking_another_target(self) -> None:
        ledger: dict[str, object] = {"schemaVersion": 1, "records": []}
        with patch.object(controller, "persist_ledger"):
            prior, _ = controller.begin_record(ledger, self.identity(), None)
            prior["localOutcome"] = "success"
            same = self.identity(deployment_id="124")
            same.update({"jti": "same-target", "nonce": "e" * 43, "intentSha256": "c" * 64})
            self.assertEqual(controller.begin_record(ledger, same, None)[1], "already-successful")
            different = self.identity(deployment_id="125", manifest="c" * 64)
            different.update({"jti": "different-target", "nonce": "f" * 43, "intentSha256": "d" * 64})
            self.assertEqual(controller.begin_record(ledger, different, None)[1], "new")

    def test_docker_login_uses_the_verified_actor_and_password_stdin(self) -> None:
        calls: list[tuple[list[str], dict[str, object]]] = []

        def run(command: list[str], **kwargs: object) -> Mock:
            calls.append((command, kwargs))
            return Mock(returncode=0)

        with (
            patch.object(controller.tempfile, "mkdtemp", return_value="/run/yolpol-deployment/request-test"),
            patch.object(controller.Path, "mkdir"),
            patch.object(controller.os, "chmod"),
            patch.object(controller.subprocess, "run", side_effect=run),
        ):
            controller.docker_auth(b"installation-token", "octocat")
        self.assertEqual(calls[0][0], [
            "/usr/bin/docker", "--config", str(Path("/run/yolpol-deployment/request-test/docker")),
            "login", "ghcr.io", "--username", "octocat", "--password-stdin",
        ])
        self.assertEqual(calls[0][1]["input"], b"installation-token")

    def test_manual_review_modes_publish_terminal_error_without_transaction(self) -> None:
        for mode, phase, result in (
            ("manual-database-review", "manual-review-blocked", controller.MANUAL_DATABASE_REVIEW_RESULT),
            (
                "manual-deployment-reconciliation",
                "manual-reconciliation-blocked",
                controller.MANUAL_DEPLOYMENT_RECONCILIATION_RESULT,
            ),
        ):
            with self.subTest(mode=mode):
                self._assert_terminal_review(mode, phase, result)

    def _assert_terminal_review(self, mode: str, phase: str, result: str) -> None:
        blocked = {
            "phase": phase,
            "localOutcome": "failure",
            "result": result,
        }
        app = Mock()
        app.get_deployment.return_value = {}
        with (
            patch.object(controller, "require_root_and_lock"),
            patch.object(controller, "load_host_config", return_value=config()),
            patch.object(controller, "read_stdin", return_value=b"submission"),
            patch.object(controller, "parse_submission", return_value=("124", envelope())),
            patch.object(controller, "verify_oidc", return_value={
                "jti": "new-jti", "actor": "farhadesmaeili", "actor_id": "24680",
            }),
            patch.object(controller, "GitHubAppClient", return_value=app),
            patch.object(controller, "validate_deployment_object"),
            patch.object(controller, "decrypt_capability", return_value=b"token"),
            patch.object(controller, "load_python", return_value=Mock()),
            patch.object(controller, "current_authority", return_value=None),
            patch.object(controller, "load_ledger", return_value={"schemaVersion": 1, "records": []}),
            patch.object(controller, "begin_record", return_value=(blocked, mode)),
            patch.object(controller, "post_status") as post_status,
            patch.object(controller, "transition"),
            patch.object(controller, "execute_transaction") as execute,
            patch.object(sys, "argv", ["yolpol-release-controller", "apply", "staging"]),
        ):
            controller.main()
        post_status.assert_called_once_with(
            config(), b"token", "124", "staging", "error", result,
        )
        execute.assert_not_called()

    def test_expired_authorization_is_terminal_before_any_mutation(self) -> None:
        app = Mock()
        with (
            patch.object(controller, "require_root_and_lock"),
            patch.object(controller, "load_host_config", return_value=config()),
            patch.object(controller, "read_stdin", return_value=b"submission"),
            patch.object(controller, "parse_submission", return_value=("124", envelope())),
            patch.object(controller, "verify_oidc", side_effect=control.ControlPlaneError("OIDC expired")),
            patch.object(controller, "GitHubAppClient", return_value=app),
            patch.object(controller, "current_authority") as current,
            patch.object(controller, "begin_record") as begin,
            patch.object(controller, "execute_transaction") as execute,
            patch.object(sys, "argv", ["yolpol-release-controller", "apply", "staging"]),
        ):
            with self.assertRaises(control.TerminalControlPlaneError):
                controller.main()
        app.get_deployment.assert_not_called()
        current.assert_not_called()
        begin.assert_not_called()
        execute.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
