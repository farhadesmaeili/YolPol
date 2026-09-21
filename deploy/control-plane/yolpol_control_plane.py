#!/usr/bin/python3
"""Shared, dependency-free security boundary for YOLPOL release deployment.

The module is installed root-owned on the host and imported by the unprivileged
polling agent and the root controller.  It deliberately contains no generic
command execution or caller-selected GitHub endpoint support.
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import ssl
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, NoReturn


PROTOCOL_VERSION = 1
OPERATION = "deploy-release"
OIDC_ISSUER = "https://token.actions.githubusercontent.com"
OIDC_CONFIGURATION_URL = f"{OIDC_ISSUER}/.well-known/openid-configuration"
OIDC_AUDIENCE_PREFIX = "yolpol-release-v1:"
DEPLOYMENT_TASK = "yolpol-release-v1"
DEPLOYMENT_DESCRIPTION = "YOLPOL authenticated release deployment"
ALLOWED_ALGORITHM = "RS256"
CAPABILITY_ALGORITHM = "rsa-oaep-sha256"
CAPABILITY_TYPE = "github-actions-token"
MAX_INTENT_BYTES = 16_384
MAX_ENVELOPE_BYTES = 64_000
MAX_HTTP_BYTES = 1_000_000
MAX_INTENT_LIFETIME_SECONDS = 300
CLOCK_SKEW_SECONDS = 30
BODY_TO_TOKEN_SKEW_SECONDS = 60
HTTP_TIMEOUT_SECONDS = 15
MIN_INSTALLATION_TOKEN_LIFETIME_SECONDS = 120
MAX_INSTALLATION_TOKEN_LIFETIME_SECONDS = 3_700
AGENT_GID = 1002
CONTROLLER_HANDLED_EXIT = 0
CONTROLLER_TERMINAL_REJECT_EXIT = 65
CONTROLLER_RETRYABLE_EXIT = 75
REPOSITORY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
DECIMAL_PATTERN = re.compile(r"^(?:0|[1-9][0-9]*)$")
GIT_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
TAG_PATTERN = re.compile(r"^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$")
NONCE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
KEY_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
JWT_PATTERN = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
ACTOR_PATTERN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\[bot\])?$")

BODY_KEYS = (
    "protocolVersion",
    "operation",
    "repository",
    "repositoryId",
    "repositoryOwner",
    "repositoryOwnerId",
    "environment",
    "releaseTag",
    "gitSha",
    "manifestSha256",
    "workflowRunId",
    "workflowRunAttempt",
    "workflowRef",
    "workflowSha",
    "jobWorkflowRef",
    "jobWorkflowSha",
    "eventName",
    "ref",
    "issuedAtUnix",
    "expiresAtUnix",
    "nonce",
    "capability",
)
CAPABILITY_KEYS = ("type", "keyId", "algorithm", "ciphertext")
ENVELOPE_KEYS = ("intentBody", "oidcJwt")
SUBMISSION_KEYS = ("schemaVersion", "deploymentId", "environment", "envelope")


class ControlPlaneError(Exception):
    """A safely reportable fail-closed rejection."""


class RetryableControlPlaneError(ControlPlaneError):
    """A failure that must leave the Deployment eligible for retry."""


class TerminalControlPlaneError(ControlPlaneError):
    """A permanently invalid request that was rejected before mutation."""


def fail(message: str) -> NoReturn:
    raise ControlPlaneError(message)


def _reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail("duplicate JSON key")
        result[key] = value
    return result


def strict_json(data: bytes, *, maximum: int, label: str) -> dict[str, Any]:
    if not data or len(data) > maximum or data.startswith(b"\xef\xbb\xbf"):
        fail(f"{label} size or encoding rejected")
    if data != data.strip() or data.endswith(b"\n") or data.endswith(b"\r"):
        fail(f"{label} whitespace rejected")
    try:
        text = data.decode("utf-8", "strict")
        decoder = json.JSONDecoder(object_pairs_hook=_reject_duplicates)
        value, end = decoder.raw_decode(text)
    except (UnicodeError, json.JSONDecodeError, ControlPlaneError) as error:
        raise ControlPlaneError(f"{label} JSON rejected") from error
    if end != len(text) or not isinstance(value, dict):
        fail(f"{label} trailing data or type rejected")
    return value


def require_exact_keys(value: dict[str, Any], expected: tuple[str, ...], label: str) -> None:
    if tuple(value.keys()) != expected:
        fail(f"{label} keys or order rejected")


def b64url_decode(value: str, *, label: str, maximum: int) -> bytes:
    if not isinstance(value, str) or not value or "=" in value or len(value) > maximum * 2:
        fail(f"{label} base64url rejected")
    if re.fullmatch(r"[A-Za-z0-9_-]+", value) is None:
        fail(f"{label} base64url rejected")
    try:
        decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, base64.binascii.Error) as error:
        raise ControlPlaneError(f"{label} base64url rejected") from error
    if len(decoded) > maximum or b64url_encode(decoded) != value:
        fail(f"{label} base64url rejected")
    return decoded


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def require_string(value: Any, label: str, *, maximum: int = 1024) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > maximum:
        fail(f"{label} rejected")
    return value


def require_decimal(value: Any, label: str) -> str:
    text = require_string(value, label, maximum=32)
    if DECIMAL_PATTERN.fullmatch(text) is None:
        fail(f"{label} rejected")
    return text


def require_actor(value: Any) -> str:
    actor = require_string(value, "OIDC actor", maximum=100)
    if ACTOR_PATTERN.fullmatch(actor) is None:
        fail("OIDC actor rejected")
    return actor


def require_integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        fail(f"{label} rejected")
    return value


@dataclass(frozen=True)
class Intent:
    raw: bytes
    digest: str
    value: dict[str, Any]

    @property
    def environment(self) -> str:
        return str(self.value["environment"])


@dataclass(frozen=True)
class Envelope:
    intent_encoded: str
    oidc_jwt: str
    intent: Intent


def parse_intent_body(raw: bytes, *, expected_repository: str | None = None) -> Intent:
    value = strict_json(raw, maximum=MAX_INTENT_BYTES, label="intent body")
    require_exact_keys(value, BODY_KEYS, "intent body")
    if value["protocolVersion"] != PROTOCOL_VERSION or value["operation"] != OPERATION:
        fail("intent protocol or operation rejected")
    repository = require_string(value["repository"], "repository", maximum=200)
    if REPOSITORY_PATTERN.fullmatch(repository) is None or (expected_repository is not None and repository != expected_repository):
        fail("repository rejected")
    require_decimal(value["repositoryId"], "repositoryId")
    owner = require_string(value["repositoryOwner"], "repositoryOwner", maximum=100)
    if repository.split("/", 1)[0] != owner:
        fail("repository owner rejected")
    require_decimal(value["repositoryOwnerId"], "repositoryOwnerId")
    if value["environment"] not in {"staging", "production"}:
        fail("environment rejected")
    if TAG_PATTERN.fullmatch(require_string(value["releaseTag"], "releaseTag", maximum=64)) is None:
        fail("release tag rejected")
    if GIT_SHA_PATTERN.fullmatch(require_string(value["gitSha"], "gitSha", maximum=40)) is None:
        fail("git SHA rejected")
    if SHA256_PATTERN.fullmatch(require_string(value["manifestSha256"], "manifestSha256", maximum=64)) is None:
        fail("manifest digest rejected")
    require_decimal(value["workflowRunId"], "workflowRunId")
    require_integer(value["workflowRunAttempt"], "workflowRunAttempt", minimum=1)
    for name in ("workflowRef", "jobWorkflowRef"):
        require_string(value[name], name, maximum=512)
    for name in ("workflowSha", "jobWorkflowSha"):
        if GIT_SHA_PATTERN.fullmatch(require_string(value[name], name, maximum=40)) is None:
            fail(f"{name} rejected")
    if value["eventName"] not in {"push", "workflow_dispatch"}:
        fail("event name rejected")
    require_string(value["ref"], "ref", maximum=300)
    issued = require_integer(value["issuedAtUnix"], "issuedAtUnix", minimum=1)
    expires = require_integer(value["expiresAtUnix"], "expiresAtUnix", minimum=1)
    if expires <= issued or expires - issued > MAX_INTENT_LIFETIME_SECONDS:
        fail("intent lifetime rejected")
    if NONCE_PATTERN.fullmatch(require_string(value["nonce"], "nonce", maximum=43)) is None:
        fail("nonce rejected")
    capability = value["capability"]
    if not isinstance(capability, dict):
        fail("capability rejected")
    require_exact_keys(capability, CAPABILITY_KEYS, "capability")
    if capability["type"] != CAPABILITY_TYPE or capability["algorithm"] != CAPABILITY_ALGORITHM:
        fail("capability contract rejected")
    if KEY_ID_PATTERN.fullmatch(require_string(capability["keyId"], "capability key ID", maximum=64)) is None:
        fail("capability key ID rejected")
    b64url_decode(require_string(capability["ciphertext"], "capability ciphertext", maximum=16_384), label="capability ciphertext", maximum=8_192)
    digest = hashlib.sha256(raw).hexdigest()
    return Intent(raw=raw, digest=digest, value=value)


def parse_envelope(value: Any, *, expected_repository: str | None = None) -> Envelope:
    if not isinstance(value, dict):
        fail("envelope rejected")
    require_exact_keys(value, ENVELOPE_KEYS, "envelope")
    encoded = require_string(value["intentBody"], "intentBody", maximum=MAX_INTENT_BYTES * 2)
    raw = b64url_decode(encoded, label="intentBody", maximum=MAX_INTENT_BYTES)
    token = require_string(value["oidcJwt"], "oidcJwt", maximum=16_384)
    if JWT_PATTERN.fullmatch(token) is None:
        fail("OIDC token format rejected")
    return Envelope(encoded, token, parse_intent_body(raw, expected_repository=expected_repository))


def parse_submission(raw: bytes, *, expected_environment: str, expected_repository: str) -> tuple[str, Envelope]:
    value = strict_json(raw, maximum=MAX_ENVELOPE_BYTES, label="controller submission")
    require_exact_keys(value, SUBMISSION_KEYS, "controller submission")
    if value["schemaVersion"] != 1 or value["environment"] != expected_environment:
        fail("controller submission contract rejected")
    deployment_id = require_decimal(value["deploymentId"], "deploymentId")
    if deployment_id == "0":
        fail("deploymentId rejected")
    envelope = parse_envelope(value["envelope"], expected_repository=expected_repository)
    if envelope.intent.environment != expected_environment:
        fail("intent environment rejected")
    return deployment_id, envelope


@dataclass(frozen=True)
class EnvironmentTrust:
    subject: str
    workflow_ref: str
    job_workflow_ref: str
    event_name: str
    ref: str
    capability_key_id: str
    capability_private_key_file: str


@dataclass(frozen=True)
class HostConfig:
    repository: str
    repository_id: str
    repository_owner: str
    repository_owner_id: str
    app_id: str
    installation_id: str
    app_private_key_file: str
    staging: EnvironmentTrust
    production: EnvironmentTrust

    def environment(self, name: str) -> EnvironmentTrust:
        if name == "staging":
            return self.staging
        if name == "production":
            return self.production
        fail("configured environment rejected")


def _environment_trust(value: Any, label: str) -> EnvironmentTrust:
    keys = ("subject", "workflowRef", "jobWorkflowRef", "eventName", "ref", "capabilityKeyId", "capabilityPrivateKeyFile")
    if not isinstance(value, dict):
        fail(f"{label} configuration rejected")
    require_exact_keys(value, keys, label)
    strings = {key: require_string(value[key], f"{label}.{key}", maximum=512) for key in keys}
    if strings["eventName"] not in {"push", "workflow_dispatch"}:
        fail(f"{label} event rejected")
    if KEY_ID_PATTERN.fullmatch(strings["capabilityKeyId"]) is None:
        fail(f"{label} key ID rejected")
    expected_path = f"/etc/yolpol/control-plane/{label}-capability-private.pem"
    if strings["capabilityPrivateKeyFile"] != expected_path:
        fail(f"{label} capability key path rejected")
    return EnvironmentTrust(
        subject=strings["subject"], workflow_ref=strings["workflowRef"],
        job_workflow_ref=strings["jobWorkflowRef"], event_name=strings["eventName"],
        ref=strings["ref"], capability_key_id=strings["capabilityKeyId"],
        capability_private_key_file=strings["capabilityPrivateKeyFile"],
    )


def load_host_config(path: Path) -> HostConfig:
    metadata = path.lstat()
    if (
        not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode)
        or metadata.st_uid != 0 or metadata.st_gid != AGENT_GID
        or stat.S_IMODE(metadata.st_mode) != 0o440
    ):
        fail("control-plane configuration metadata rejected")
    value = strict_json(path.read_bytes(), maximum=32_768, label="control-plane configuration")
    keys = (
        "schemaVersion", "repository", "repositoryId", "repositoryOwner", "repositoryOwnerId",
        "githubAppId", "githubAppInstallationId", "githubAppPrivateKeyFile", "staging", "production",
    )
    require_exact_keys(value, keys, "control-plane configuration")
    if value["schemaVersion"] != 1:
        fail("control-plane configuration version rejected")
    repository = require_string(value["repository"], "configured repository", maximum=200)
    owner = require_string(value["repositoryOwner"], "configured owner", maximum=100)
    if REPOSITORY_PATTERN.fullmatch(repository) is None or repository.split("/", 1)[0] != owner:
        fail("configured repository rejected")
    app_key = require_string(value["githubAppPrivateKeyFile"], "GitHub App key path", maximum=256)
    if app_key != "/etc/yolpol/control-plane/github-app-private.pem":
        fail("GitHub App key path rejected")
    return HostConfig(
        repository=repository,
        repository_id=require_decimal(value["repositoryId"], "configured repositoryId"),
        repository_owner=owner,
        repository_owner_id=require_decimal(value["repositoryOwnerId"], "configured repositoryOwnerId"),
        app_id=require_decimal(value["githubAppId"], "GitHub App ID"),
        installation_id=require_decimal(value["githubAppInstallationId"], "GitHub App installation ID"),
        app_private_key_file=app_key,
        staging=_environment_trust(value["staging"], "staging"),
        production=_environment_trust(value["production"], "production"),
    )


def validate_private_key_file(path: Path, *, agent_gid: int | None = None) -> None:
    metadata = path.lstat()
    expected_gid = 0 if agent_gid is None else agent_gid
    expected_mode = 0o400 if agent_gid is None else 0o440
    if (
        not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode)
        or metadata.st_uid != 0 or metadata.st_gid != expected_gid
        or stat.S_IMODE(metadata.st_mode) != expected_mode
    ):
        fail("private key metadata rejected")


class HttpResponse:
    def __init__(self, status: int, headers: dict[str, str], body: bytes):
        self.status = status
        self.headers = {key.lower(): value for key, value in headers.items()}
        self.body = body


Transport = Callable[[str, str, dict[str, str], bytes | None], HttpResponse]


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep bearer credentials off cross-origin redirect targets."""

    def redirect_request(self, request: Any, fp: Any, code: int, message: str, headers: Any, new_url: str) -> Any:
        redirected = super().redirect_request(request, fp, code, message, headers, new_url)
        if redirected is None:
            return None
        old = urllib.parse.urlsplit(request.full_url)
        new = urllib.parse.urlsplit(new_url)
        if new.scheme != "https":
            fail("insecure redirect rejected")
        if (old.scheme, old.hostname, old.port) != (new.scheme, new.hostname, new.port):
            redirected.remove_header("Authorization")
        return redirected


def default_transport(method: str, url: str, headers: dict[str, str], body: bytes | None) -> HttpResponse:
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        SafeRedirectHandler(),
    )
    try:
        with opener.open(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            content = response.read(MAX_HTTP_BYTES + 1)
            if len(content) > MAX_HTTP_BYTES:
                fail("GitHub response size rejected")
            return HttpResponse(response.status, dict(response.headers.items()), content)
    except urllib.error.HTTPError as error:
        content = error.read(MAX_HTTP_BYTES + 1)
        return HttpResponse(error.code, dict(error.headers.items()), content)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise RetryableControlPlaneError("GitHub request failed") from error


def _json_response(response: HttpResponse, *, expected_status: int, label: str) -> dict[str, Any]:
    if response.status != expected_status:
        fail(f"{label} request rejected")
    return strict_json(response.body, maximum=MAX_HTTP_BYTES, label=label)


def _retryable_json_response(response: HttpResponse, *, expected_status: int, label: str) -> dict[str, Any]:
    try:
        return _json_response(response, expected_status=expected_status, label=label)
    except RetryableControlPlaneError:
        raise
    except ControlPlaneError as error:
        raise RetryableControlPlaneError(f"{label} response temporarily rejected") from error


def sign_github_app_jwt(config: HostConfig, *, now: int | None = None) -> str:
    timestamp = int(time.time()) if now is None else now
    header = b64url_encode(b'{"alg":"RS256","typ":"JWT"}')
    payload = b64url_encode(json.dumps(
        {"iat": timestamp - 30, "exp": timestamp + 540, "iss": config.app_id},
        separators=(",", ":"), sort_keys=False,
    ).encode("ascii"))
    signing_input = f"{header}.{payload}".encode("ascii")
    key_path = Path(config.app_private_key_file)
    validate_private_key_file(key_path, agent_gid=AGENT_GID)
    descriptor = os.open(key_path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        result = subprocess.run(
            [
                "/usr/bin/openssl", "dgst", "-sha256", "-sign", f"/proc/self/fd/{descriptor}",
            ],
            input=signing_input,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            pass_fds=(descriptor,),
        )
    finally:
        os.close(descriptor)
    if result.returncode != 0 or not result.stdout:
        fail("GitHub App JWT signing failed")
    return f"{header}.{payload}.{b64url_encode(result.stdout)}"


class GitHubAppClient:
    """Read-only repository discovery client using short-lived App installation tokens."""

    API_ROOT = "https://api.github.com"

    def __init__(self, config: HostConfig, transport: Transport = default_transport):
        self.config = config
        self.transport = transport
        self._token: str | None = None
        self._token_expires = 0

    def installation_token(self, *, now: int | None = None) -> str:
        timestamp = int(time.time()) if now is None else now
        if self._token is not None and timestamp < self._token_expires - 120:
            return self._token
        app_jwt = sign_github_app_jwt(self.config, now=timestamp)
        url = f"{self.API_ROOT}/app/installations/{self.config.installation_id}/access_tokens"
        request_body = json.dumps({
            "repository_ids": [int(self.config.repository_id)],
            "permissions": {"deployments": "read"},
        }, separators=(",", ":"), sort_keys=False).encode("ascii")
        response = self.transport("POST", url, self._headers(app_jwt), request_body)
        value = _retryable_json_response(response, expected_status=201, label="GitHub App token")
        if "token" not in value or "expires_at" not in value or "permissions" not in value:
            fail("GitHub App token response rejected")
        token = require_string(value["token"], "GitHub App installation token", maximum=1_024)
        expires_at = require_string(value["expires_at"], "GitHub App token expiry", maximum=64)
        permissions = value["permissions"]
        if (
            not isinstance(permissions, dict)
            or set(permissions) not in ({"deployments"}, {"deployments", "metadata"})
            or permissions.get("deployments") != "read"
            or ("metadata" in permissions and permissions["metadata"] != "read")
        ):
            fail("GitHub App token permissions rejected")
        repository_selection = value.get("repository_selection")
        if repository_selection is not None and repository_selection != "selected":
            fail("GitHub App token repository selection rejected")
        repositories = value.get("repositories")
        if repositories is not None:
            if not isinstance(repositories, list) or len(repositories) != 1:
                fail("GitHub App token repository scope rejected")
            repository = repositories[0]
            if (
                not isinstance(repository, dict)
                or isinstance(repository.get("id"), bool)
                or not isinstance(repository.get("id"), int)
                or str(repository["id"]) != self.config.repository_id
                or repository.get("full_name") != self.config.repository
            ):
                fail("GitHub App token repository scope rejected")
        try:
            parsed_expiry = dt.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except (TypeError, ValueError) as error:
            raise ControlPlaneError("GitHub App token expiry rejected") from error
        if parsed_expiry.tzinfo is None:
            fail("GitHub App token expiry rejected")
        expires = int(parsed_expiry.timestamp())
        lifetime = expires - timestamp
        if not MIN_INSTALLATION_TOKEN_LIFETIME_SECONDS < lifetime <= MAX_INSTALLATION_TOKEN_LIFETIME_SECONDS:
            fail("GitHub App token lifetime rejected")
        self._token = token
        self._token_expires = expires
        return token

    @staticmethod
    def _headers(token: str, *, etag: str | None = None) -> dict[str, str]:
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "yolpol-deployment-agent/1",
        }
        if etag is not None:
            headers["If-None-Match"] = etag
        return headers

    def list_deployments(self, environment: str, *, etag: str | None = None) -> HttpResponse:
        if environment not in {"staging", "production"}:
            fail("polling environment rejected")
        owner, repository = self.config.repository.split("/", 1)
        query = urllib.parse.urlencode({"environment": environment, "task": DEPLOYMENT_TASK, "per_page": "20"})
        url = f"{self.API_ROOT}/repos/{owner}/{repository}/deployments?{query}"
        response = self.transport("GET", url, self._headers(self.installation_token(), etag=etag), None)
        if response.status not in {200, 304, 403, 429, 500, 502, 503, 504}:
            fail("deployment polling response rejected")
        return response

    def get_deployment(self, deployment_id: str) -> dict[str, Any]:
        require_decimal(deployment_id, "deployment ID")
        owner, repository = self.config.repository.split("/", 1)
        url = f"{self.API_ROOT}/repos/{owner}/{repository}/deployments/{deployment_id}"
        response = self.transport("GET", url, self._headers(self.installation_token()), None)
        return _retryable_json_response(response, expected_status=200, label="GitHub Deployment")


def _jwt_parts(compact: str) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    parts = compact.split(".")
    if len(parts) != 3:
        fail("OIDC token format rejected")
    header = strict_json(b64url_decode(parts[0], label="JWT header", maximum=4_096), maximum=4_096, label="JWT header")
    claims = strict_json(b64url_decode(parts[1], label="JWT claims", maximum=16_384), maximum=16_384, label="JWT claims")
    signature = b64url_decode(parts[2], label="JWT signature", maximum=1_024)
    return header, claims, signature, f"{parts[0]}.{parts[1]}".encode("ascii")


def _verify_signature(signing_input: bytes, signature: bytes, certificate_b64: str) -> None:
    try:
        certificate = base64.b64decode(certificate_b64, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise ControlPlaneError("OIDC certificate rejected") from error
    with tempfile.TemporaryDirectory(prefix="yolpol-oidc-", dir="/run") as directory:
        root = Path(directory)
        certificate_path = root / "certificate.pem"
        public_path = root / "public.pem"
        signature_path = root / "signature.bin"
        input_path = root / "input.bin"
        certificate_path.write_bytes(
            b"-----BEGIN CERTIFICATE-----\n"
            + base64.encodebytes(certificate).replace(b"\n\n", b"\n")
            + b"-----END CERTIFICATE-----\n"
        )
        signature_path.write_bytes(signature)
        input_path.write_bytes(signing_input)
        extract = subprocess.run(
            ["/usr/bin/openssl", "x509", "-pubkey", "-noout", "-in", str(certificate_path), "-out", str(public_path)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        )
        verify = subprocess.run(
            ["/usr/bin/openssl", "dgst", "-sha256", "-verify", str(public_path), "-signature", str(signature_path), str(input_path)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        ) if extract.returncode == 0 else None
        if verify is None or verify.returncode != 0:
            fail("OIDC signature rejected")


def _certificate_der(certificate_b64: str) -> bytes:
    try:
        return base64.b64decode(certificate_b64, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise ControlPlaneError("OIDC certificate rejected") from error


def _validate_x5t(value: Any, certificate_b64: str) -> None:
    thumbprint = b64url_decode(value, label="OIDC x5t", maximum=20)
    if len(thumbprint) != 20:
        fail("OIDC x5t rejected")
    certificate = _certificate_der(certificate_b64)
    expected = hashlib.sha1(certificate, usedforsecurity=False).digest()
    if not hmac.compare_digest(thumbprint, expected):
        fail("OIDC x5t rejected")


def verify_oidc(
    envelope: Envelope,
    config: HostConfig,
    *,
    transport: Transport = default_transport,
    now: int | None = None,
    signature_verifier: Callable[[bytes, bytes, str], None] = _verify_signature,
) -> dict[str, Any]:
    timestamp = int(time.time()) if now is None else now
    header, claims, signature, signing_input = _jwt_parts(envelope.oidc_jwt)
    if set(header) - {"alg", "typ", "kid", "x5t", "crit"}:
        fail("OIDC header contains unsupported fields")
    if header.get("alg") != ALLOWED_ALGORITHM or header.get("typ") != "JWT":
        fail("OIDC header algorithm or type rejected")
    if "crit" in header:
        fail("OIDC critical headers rejected")
    kid = require_string(header.get("kid"), "OIDC kid", maximum=256)
    configuration = _retryable_json_response(
        transport("GET", OIDC_CONFIGURATION_URL, {}, None),
        expected_status=200,
        label="OIDC configuration",
    )
    if configuration.get("issuer") != OIDC_ISSUER or configuration.get("jwks_uri") != f"{OIDC_ISSUER}/.well-known/jwks":
        fail("OIDC discovery document rejected")
    jwks = _retryable_json_response(
        transport("GET", str(configuration["jwks_uri"]), {}, None),
        expected_status=200,
        label="OIDC JWKS",
    )
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        fail("OIDC JWKS rejected")
    matching = [key for key in keys if isinstance(key, dict) and key.get("kid") == kid]
    if len(matching) != 1:
        fail("OIDC kid rejected")
    key = matching[0]
    if key.get("kty") != "RSA" or key.get("use") != "sig" or key.get("alg") not in {None, ALLOWED_ALGORITHM}:
        fail("OIDC key contract rejected")
    x5c = key.get("x5c")
    if not isinstance(x5c, list) or not x5c or not isinstance(x5c[0], str):
        fail("OIDC certificate chain rejected")
    if "x5t" in header:
        _validate_x5t(header["x5t"], x5c[0])
    signature_verifier(signing_input, signature, x5c[0])

    intent = envelope.intent.value
    trust = config.environment(envelope.intent.environment)
    expected_audience = f"{OIDC_AUDIENCE_PREFIX}{envelope.intent.digest}"
    if not isinstance(claims.get("aud"), str) or claims["aud"] != expected_audience:
        fail("OIDC audience rejected")
    exact = {
        "iss": OIDC_ISSUER,
        "repository": config.repository,
        "repository_id": config.repository_id,
        "repository_owner": config.repository_owner,
        "repository_owner_id": config.repository_owner_id,
        "environment": envelope.intent.environment,
        "sub": trust.subject,
        "workflow_ref": intent["workflowRef"],
        "job_workflow_ref": intent["jobWorkflowRef"],
        "workflow_sha": intent["workflowSha"],
        "job_workflow_sha": intent["jobWorkflowSha"],
        "event_name": intent["eventName"],
        "ref": intent["ref"],
        "run_id": intent["workflowRunId"],
        "run_attempt": str(intent["workflowRunAttempt"]),
        "runner_environment": "github-hosted",
    }
    for name, expected in exact.items():
        if claims.get(name) != expected:
            fail(f"OIDC {name} rejected")
    expected_workflow_ref = trust.workflow_ref.replace("{releaseTag}", str(intent["releaseTag"]))
    expected_job_workflow_ref = trust.job_workflow_ref.replace("{releaseTag}", str(intent["releaseTag"]))
    if intent["workflowRef"] != expected_workflow_ref or intent["jobWorkflowRef"] != expected_job_workflow_ref:
        fail("workflow trust rejected")
    if intent["eventName"] != trust.event_name or intent["ref"] != trust.ref.replace("{releaseTag}", str(intent["releaseTag"])):
        fail("event or ref trust rejected")
    actor = require_actor(claims.get("actor"))
    actor_id = require_decimal(claims.get("actor_id"), "OIDC actor_id")
    if actor_id == "0":
        fail("OIDC actor_id rejected")
    jti = require_string(claims.get("jti"), "OIDC jti", maximum=256)
    for name in ("iat", "nbf", "exp"):
        require_integer(claims.get(name), f"OIDC {name}", minimum=1)
    issued = int(intent["issuedAtUnix"])
    expires = int(intent["expiresAtUnix"])
    if issued > int(claims["iat"]) + CLOCK_SKEW_SECONDS or int(claims["iat"]) - issued > BODY_TO_TOKEN_SKEW_SECONDS:
        fail("intent and OIDC issuance rejected")
    if timestamp + CLOCK_SKEW_SECONDS < int(claims["nbf"]):
        fail("OIDC token is not yet valid")
    if timestamp - CLOCK_SKEW_SECONDS > int(claims["exp"]) or timestamp - CLOCK_SKEW_SECONDS > expires:
        fail("OIDC or intent expired")
    if int(claims["exp"]) <= int(claims["iat"]):
        fail("OIDC lifetime rejected")
    claims = dict(claims)
    claims["actor"] = actor
    claims["actor_id"] = actor_id
    claims["jti"] = jti
    return claims


def validate_deployment_object(
    deployment: dict[str, Any], deployment_id: str, envelope: Envelope, config: HostConfig,
) -> None:
    intent = envelope.intent.value
    expected_keys = {"intentBody", "oidcJwt"}
    payload = deployment.get("payload")
    if not isinstance(payload, dict) or set(payload) != expected_keys:
        fail("Deployment payload rejected")
    try:
        numeric_id = int(deployment_id)
    except ValueError as error:
        raise ControlPlaneError("Deployment ID rejected") from error
    if deployment.get("id") != numeric_id:
        fail("Deployment ID mismatch")
    if payload.get("intentBody") != envelope.intent_encoded or payload.get("oidcJwt") != envelope.oidc_jwt:
        fail("Deployment payload mismatch")
    owner, repository = config.repository.split("/", 1)
    expected_repository_url = f"https://api.github.com/repos/{owner}/{repository}"
    expected_statuses_url = f"{expected_repository_url}/deployments/{deployment_id}/statuses"
    checks = {
        "repository_url": expected_repository_url,
        "ref": intent["gitSha"],
        "sha": intent["gitSha"],
        "task": DEPLOYMENT_TASK,
        "environment": intent["environment"],
        "description": DEPLOYMENT_DESCRIPTION,
        "statuses_url": expected_statuses_url,
    }
    for name, expected in checks.items():
        if deployment.get(name) != expected:
            fail(f"Deployment {name} rejected")
    if deployment.get("transient_environment") is not False:
        fail("Deployment transient environment rejected")
    if deployment.get("production_environment") is not (intent["environment"] == "production"):
        fail("Deployment production environment rejected")
    creator = deployment.get("creator")
    if not isinstance(creator, dict) or creator.get("login") != "github-actions[bot]" or creator.get("type") != "Bot":
        fail("Deployment creator rejected")
    created = deployment.get("created_at")
    try:
        created_at = int(dt.datetime.fromisoformat(require_string(created, "Deployment created_at").replace("Z", "+00:00")).timestamp())
    except (TypeError, ValueError) as error:
        raise ControlPlaneError("Deployment created_at rejected") from error
    if created_at < int(intent["issuedAtUnix"]) - CLOCK_SKEW_SECONDS or created_at > int(intent["expiresAtUnix"]) + CLOCK_SKEW_SECONDS:
        fail("Deployment creation window rejected")


def retry_delay(headers: dict[str, str], failures: int, *, now: int | None = None) -> int:
    timestamp = int(time.time()) if now is None else now
    lowered = {key.lower(): value for key, value in headers.items()}
    retry_after = lowered.get("retry-after")
    if retry_after is not None and DECIMAL_PATTERN.fullmatch(retry_after) is not None:
        return min(max(int(retry_after), 15), 900)
    remaining = lowered.get("x-ratelimit-remaining")
    reset = lowered.get("x-ratelimit-reset")
    if remaining == "0" and reset is not None and DECIMAL_PATTERN.fullmatch(reset) is not None:
        return min(max(int(reset) - timestamp + 5, 15), 900)
    return min(15 * (2 ** min(max(failures, 0), 6)), 900)
