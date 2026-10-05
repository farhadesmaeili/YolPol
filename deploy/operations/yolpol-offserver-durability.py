#!/usr/bin/python3
"""Provider-neutral Phase C2 off-server durability contract.

The installed controller imports this root-owned module directly.  No caller can
select an adapter, destination, executable, URL, trust key, or evidence path.
The reviewed Windows SFTP adapter authenticates the exact canonical Windows
volume-flush receipt with one pinned verification authority before independently
validating the final durable-store pair.
"""

from __future__ import annotations

import base64
import hashlib
import ipaddress
import json
import math
import os
import re
import shutil
import stat
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NoReturn, Protocol


CONFIG_PATH = Path("/etc/yolpol/offserver-durability.json")
SFTP_SECRET_DIRECTORY = Path("/etc/yolpol/offserver-durability")
SFTP_KEY_PATH = SFTP_SECRET_DIRECTORY / "id_ed25519"
SFTP_KNOWN_HOSTS_PATH = SFTP_SECRET_DIRECTORY / "known_hosts"
WINDOWS_RECEIPT_PUBLIC_KEY_PATH = SFTP_SECRET_DIRECTORY / "windows-receipt-rsa-v1.pem"
SFTP_EXECUTABLE = Path("/usr/bin/sftp")
PRLIMIT_EXECUTABLE = Path("/usr/bin/prlimit")
OPENSSL_EXECUTABLE = Path("/usr/bin/openssl")
VERIFICATION_TEMP_DIRECTORY = Path("/opt/yolpol/runtime/tmp")
PRODUCTION_BACKUP_DIRECTORY = Path("/opt/yolpol/production/backups")
EVIDENCE_DIRECTORY = Path("/opt/yolpol/runtime/offserver-durability-evidence")
MAX_CONFIG_BYTES = 4_096
MAX_PRIVATE_KEY_BYTES = 16_384
MAX_KNOWN_HOSTS_BYTES = 65_536
MAX_WINDOWS_RECEIPT_PUBLIC_KEY_BYTES = 8_192
MAX_OPENSSL_PUBLIC_KEY_OUTPUT_BYTES = 8_192
MAX_ARTIFACT_BYTES = 1 * 1024 * 1024 * 1024
MAX_MANIFEST_BYTES = 65_536
MAX_DURABILITY_RECEIPT_BYTES = 4_096
WINDOWS_RECEIPT_SIGNATURE_BYTES = 384
WINDOWS_RECEIPT_PUBLIC_KEY_BITS = 3_072
TEMPORARY_PROTOCOL_OVERHEAD_BYTES = 1 * 1024 * 1024
TEMPORARY_FILESYSTEM_SAFETY_RESERVE_BYTES = 5 * 1024 * 1024 * 1024
MAX_EVIDENCE_BYTES = 8_192
MAX_EVIDENCE_AGE_SECONDS = 900
MAX_CLOCK_SKEW_SECONDS = 30
SFTP_TIMEOUT_SECONDS = 120
SFTP_RECEIPT_POLL_TIMEOUT_SECONDS = 180
SFTP_RECEIPT_POLL_INTERVAL_SECONDS = 5
SFTP_RECEIPT_ATTEMPT_TIMEOUT_SECONDS = 15
SFTP_RECEIPT_MAX_ATTEMPTS = 37

SFTP_PRODUCTION_DIRECTORY = "/production"
SFTP_DURABLE_DIRECTORY = "/durable"
SFTP_RECEIPT_DIRECTORY = "/durability-receipts"
WINDOWS_DURABILITY_CONFIRMATION = "windows-flushfilebuffers-volume-v1"
WINDOWS_RECEIPT_DOMAIN_SEPARATOR = b"YOLPOL-WINDOWS-DURABILITY-RECEIPT-V1\x00"
OPENSSL_TIMEOUT_SECONDS = 15

BACKUP_ID = re.compile(r"^yolpol-production-[0-9]{8}T[0-9]{6}Z(?:-[0-9a-f]{7,64})?$")
DEPLOYMENT_ID = re.compile(r"^[1-9][0-9]{0,19}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MIGRATION_FINGERPRINT = re.compile(r"^[A-Za-z0-9_.-]{1,128}:[0-9a-f]{64}$")
REMOTE_IDENTITY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$")
CONFIRMATION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
TAILSCALE_IPV4_NETWORK = ipaddress.ip_network("100.64.0.0/10")
SFTP_REMOTE_PATH = re.compile(r"^/[A-Za-z0-9._/-]+$")

WINDOWS_RECEIPT_KEYS = frozenset({
    "artifactSha256",
    "artifactSize",
    "backupId",
    "durabilityConfirmation",
    "manifestSha256",
    "manifestSize",
    "remoteObjectSetId",
    "schemaVersion",
})

EVIDENCE_KEYS = frozenset({
    "schemaVersion",
    "environment",
    "deploymentId",
    "backupId",
    "artifactFilename",
    "artifactSha256",
    "manifestFilename",
    "manifestSha256",
    "currentMigrationFingerprint",
    "targetMigrationFingerprint",
    "targetManifestSha256",
    "localIntegrityVerified",
    "deepArchiveVerified",
    "destinationVerified",
    "verificationSource",
    "durableWriteConfirmed",
    "durabilityConfirmation",
    "remoteObjectSetId",
    "verifiedAtUnix",
})


class DurabilityError(Exception):
    """Closed Phase C2 rejection; details must not cross the controller boundary."""


class DurabilityUnavailable(DurabilityError):
    """No reviewed remote durability adapter is activated."""


def fail(message: str) -> NoReturn:
    raise DurabilityError(message)


def _reject_constant(_value: str) -> NoReturn:
    fail("non-finite JSON value rejected")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail("duplicate JSON key rejected")
        result[key] = value
    return result


def strict_object(data: bytes, maximum: int, label: str) -> dict[str, Any]:
    if not data or len(data) > maximum or data.startswith(b"\xef\xbb\xbf"):
        fail(f"{label} rejected")
    try:
        text = data.decode("utf-8", "strict")
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError, DurabilityError) as error:
        raise DurabilityError(f"{label} rejected") from error
    if not isinstance(value, dict):
        fail(f"{label} rejected")
    return value


def canonical_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("ascii") + b"\n"


def _require_exact_keys(value: dict[str, Any], expected: frozenset[str], label: str) -> None:
    if set(value) != expected:
        fail(f"{label} fields rejected")


def _require_string(value: Any, pattern: re.Pattern[str], label: str) -> str:
    if not isinstance(value, str) or pattern.fullmatch(value) is None:
        fail(f"{label} rejected")
    return value


def _require_integer(
    value: Any,
    label: str,
    *,
    expected: int | None = None,
    minimum: int | None = None,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        fail(f"{label} rejected")
    if expected is not None and value != expected:
        fail(f"{label} rejected")
    if minimum is not None and value < minimum:
        fail(f"{label} rejected")
    return value


def _require_true(value: Any, label: str) -> None:
    if not isinstance(value, bool) or value is not True:
        fail(f"{label} rejected")


def _require_plain_directory(path: Path, label: str) -> None:
    try:
        metadata = path.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or path.resolve(strict=True) != path:
            fail(f"{label} rejected")
    except OSError as error:
        raise DurabilityError(f"{label} rejected") from error


def _regular_file(path: Path, parent: Path, label: str) -> os.stat_result:
    try:
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode):
            fail(f"{label} rejected")
        if path.parent.resolve(strict=True) != parent or path.resolve(strict=True).parent != parent:
            fail(f"{label} rejected")
        return metadata
    except OSError as error:
        raise DurabilityError(f"{label} rejected") from error


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            while block := stream.read(1024 * 1024):
                digest.update(block)
    except OSError as error:
        raise DurabilityError("backup pair read rejected") from error
    return digest.hexdigest()


@dataclass(frozen=True)
class DurabilityContext:
    deployment_id: str
    backup_id: str
    current_migration_fingerprint: str
    target_migration_fingerprint: str
    target_manifest_sha256: str

    def validate(self) -> None:
        _require_string(self.deployment_id, DEPLOYMENT_ID, "deployment identity")
        _require_string(self.backup_id, BACKUP_ID, "backup identity")
        _require_string(
            self.current_migration_fingerprint,
            MIGRATION_FINGERPRINT,
            "current migration fingerprint",
        )
        _require_string(
            self.target_migration_fingerprint,
            MIGRATION_FINGERPRINT,
            "target migration fingerprint",
        )
        _require_string(self.target_manifest_sha256, SHA256, "target manifest identity")
        if self.current_migration_fingerprint == self.target_migration_fingerprint:
            fail("unchanged migration transition rejected")


@dataclass(frozen=True)
class BackupPair:
    backup_id: str
    artifact_path: Path
    artifact_filename: str
    artifact_size: int
    artifact_sha256: str
    manifest_path: Path
    manifest_filename: str
    manifest_size: int
    manifest_sha256: str


@dataclass(frozen=True)
class RemoteDurabilityConfirmation:
    backup_id: str
    artifact_sha256: str
    manifest_sha256: str
    destination_verified: bool
    verification_source: str
    durable_write_confirmed: bool
    durability_confirmation: str
    remote_object_set_id: str
    verified_at_unix: int


class RemoteDurabilityAdapter(Protocol):
    """Fixed reviewed adapters copy and independently verify one encrypted pair."""

    def copy_and_verify(self, pair: BackupPair, now_unix: int) -> RemoteDurabilityConfirmation:
        ...


@dataclass(frozen=True)
class WindowsSftpConfiguration:
    host: str
    port: int
    username: str
    remote_directory: str


def inspect_backup_pair(source_directory: Path, backup_id: str) -> BackupPair:
    _require_plain_directory(source_directory, "backup source directory")
    _require_string(backup_id, BACKUP_ID, "backup identity")
    artifact_filename = f"{backup_id}.dump.age"
    manifest_filename = f"{backup_id}.manifest.json"
    artifact_path = source_directory / artifact_filename
    manifest_path = source_directory / manifest_filename
    artifact_metadata = _regular_file(artifact_path, source_directory, "encrypted backup artifact")
    manifest_metadata = _regular_file(manifest_path, source_directory, "backup manifest")
    if artifact_metadata.st_size <= 0 or artifact_metadata.st_size > MAX_ARTIFACT_BYTES:
        fail("backup artifact size rejected")
    if manifest_metadata.st_size <= 0 or manifest_metadata.st_size > MAX_MANIFEST_BYTES:
        fail("backup manifest size rejected")
    try:
        manifest_bytes = manifest_path.read_bytes()
    except OSError as error:
        raise DurabilityError("backup manifest read rejected") from error
    manifest = strict_object(manifest_bytes, MAX_MANIFEST_BYTES, "backup manifest")
    _require_exact_keys(
        manifest,
        frozenset({
            "formatVersion", "backupId", "createdAt", "deploymentEnvironment",
            "applicationRevision", "postgresql", "dump", "encryption", "artifact", "schema",
        }),
        "backup manifest",
    )
    _require_integer(manifest.get("formatVersion"), "backup manifest version", expected=1)
    if manifest.get("deploymentEnvironment") != "production":
        fail("backup manifest identity rejected")
    if manifest.get("backupId") != backup_id:
        fail("backup manifest identity rejected")
    identity = backup_id.removeprefix("yolpol-production-")
    compact_timestamp = identity[:16]
    expected_created_at = (
        f"{compact_timestamp[0:4]}-{compact_timestamp[4:6]}-{compact_timestamp[6:8]}"
        f"T{compact_timestamp[9:11]}:{compact_timestamp[11:13]}:{compact_timestamp[13:15]}Z"
    )
    revision = identity[17:] if len(identity) > 16 else ""
    if manifest.get("createdAt") != expected_created_at:
        fail("backup manifest timestamp rejected")
    if manifest.get("applicationRevision") != (revision or None):
        fail("backup manifest revision rejected")
    postgresql = manifest.get("postgresql")
    if not isinstance(postgresql, dict):
        fail("backup PostgreSQL manifest rejected")
    _require_exact_keys(
        postgresql,
        frozenset({"majorVersion", "serverVersion", "clientVersion"}),
        "backup PostgreSQL manifest",
    )
    _require_integer(postgresql.get("majorVersion"), "backup PostgreSQL version", expected=17)
    for key in ("serverVersion", "clientVersion"):
        text = postgresql.get(key)
        if not isinstance(text, str) or not text or len(text) > 128:
            fail("backup PostgreSQL version rejected")
    dump = manifest.get("dump")
    encryption = manifest.get("encryption")
    if dump != {"format": "custom"} or encryption != {"scheme": "age-x25519"}:
        fail("backup archive format rejected")
    schema = manifest.get("schema")
    if not isinstance(schema, dict):
        fail("backup schema manifest rejected")
    _require_exact_keys(
        schema,
        frozenset({"latestMigrationTimestamp", "requiredMigration", "requiredMigrationTimestamp"}),
        "backup schema manifest",
    )
    _require_integer(
        schema.get("latestMigrationTimestamp"),
        "backup migration state",
        minimum=0,
    )
    if (
        schema.get("requiredMigration") != "0023_telegram_notification_destinations"
    ):
        fail("backup required migration rejected")
    _require_integer(
        schema.get("requiredMigrationTimestamp"),
        "backup required migration",
        expected=1_789_391_490_099,
    )
    artifact = manifest.get("artifact")
    if not isinstance(artifact, dict):
        fail("backup artifact manifest rejected")
    _require_exact_keys(artifact, frozenset({"filename", "sizeBytes", "sha256"}), "backup artifact manifest")
    if artifact.get("filename") != artifact_filename:
        fail("backup artifact filename rejected")
    size = _require_integer(artifact.get("sizeBytes"), "backup artifact size", minimum=1)
    if size != artifact_metadata.st_size:
        fail("backup artifact size rejected")
    expected_artifact_sha256 = _require_string(artifact.get("sha256"), SHA256, "backup artifact checksum")
    actual_artifact_sha256 = _sha256_file(artifact_path)
    if actual_artifact_sha256 != expected_artifact_sha256:
        fail("backup artifact checksum rejected")
    return BackupPair(
        backup_id=backup_id,
        artifact_path=artifact_path,
        artifact_filename=artifact_filename,
        artifact_size=size,
        artifact_sha256=actual_artifact_sha256,
        manifest_path=manifest_path,
        manifest_filename=manifest_filename,
        manifest_size=manifest_metadata.st_size,
        manifest_sha256=hashlib.sha256(manifest_bytes).hexdigest(),
    )


def _validate_confirmation(
    confirmation: RemoteDurabilityConfirmation,
    context: DurabilityContext,
    pair: BackupPair,
    now_unix: int,
) -> None:
    if not isinstance(confirmation, RemoteDurabilityConfirmation):
        fail("remote durability confirmation rejected")
    if (
        confirmation.backup_id != context.backup_id
        or confirmation.artifact_sha256 != pair.artifact_sha256
        or confirmation.manifest_sha256 != pair.manifest_sha256
    ):
        fail("remote durability pair identity rejected")
    _require_true(confirmation.destination_verified, "destination verification")
    if confirmation.verification_source != "destination":
        fail("destination verification source rejected")
    _require_true(confirmation.durable_write_confirmed, "durable write confirmation")
    _require_string(confirmation.durability_confirmation, CONFIRMATION, "durability confirmation")
    remote_identity = _require_string(
        confirmation.remote_object_set_id,
        REMOTE_IDENTITY,
        "remote object identity",
    )
    if "://" in remote_identity or "@" in remote_identity:
        fail("remote object identity rejected")
    _require_integer(confirmation.verified_at_unix, "verification timestamp")
    if confirmation.verified_at_unix > now_unix + MAX_CLOCK_SKEW_SECONDS:
        fail("future durability evidence rejected")
    if now_unix - confirmation.verified_at_unix > MAX_EVIDENCE_AGE_SECONDS:
        fail("stale durability evidence rejected")


def evidence_value(
    context: DurabilityContext,
    pair: BackupPair,
    confirmation: RemoteDurabilityConfirmation,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "environment": "production",
        "deploymentId": context.deployment_id,
        "backupId": context.backup_id,
        "artifactFilename": pair.artifact_filename,
        "artifactSha256": pair.artifact_sha256,
        "manifestFilename": pair.manifest_filename,
        "manifestSha256": pair.manifest_sha256,
        "currentMigrationFingerprint": context.current_migration_fingerprint,
        "targetMigrationFingerprint": context.target_migration_fingerprint,
        "targetManifestSha256": context.target_manifest_sha256,
        "localIntegrityVerified": True,
        "deepArchiveVerified": True,
        "destinationVerified": confirmation.destination_verified,
        "verificationSource": confirmation.verification_source,
        "durableWriteConfirmed": confirmation.durable_write_confirmed,
        "durabilityConfirmation": confirmation.durability_confirmation,
        "remoteObjectSetId": confirmation.remote_object_set_id,
        "verifiedAtUnix": confirmation.verified_at_unix,
    }


def validate_evidence_bytes(
    data: bytes,
    context: DurabilityContext,
    pair: BackupPair,
    now_unix: int,
) -> dict[str, Any]:
    context.validate()
    value = strict_object(data, MAX_EVIDENCE_BYTES, "durability evidence")
    _require_exact_keys(value, EVIDENCE_KEYS, "durability evidence")
    if canonical_bytes(value) != data:
        fail("non-canonical durability evidence rejected")
    _require_integer(value.get("schemaVersion"), "durability evidence schema version", expected=1)
    _require_true(value.get("localIntegrityVerified"), "local integrity verification")
    _require_true(value.get("deepArchiveVerified"), "deep archive verification")
    _require_true(value.get("destinationVerified"), "destination verification")
    _require_true(value.get("durableWriteConfirmed"), "durable write confirmation")
    expected = evidence_value(
        context,
        pair,
        RemoteDurabilityConfirmation(
            backup_id=context.backup_id,
            artifact_sha256=pair.artifact_sha256,
            manifest_sha256=pair.manifest_sha256,
            destination_verified=True,
            verification_source="destination",
            durable_write_confirmed=True,
            durability_confirmation=str(value.get("durabilityConfirmation", "")),
            remote_object_set_id=str(value.get("remoteObjectSetId", "")),
            verified_at_unix=value.get("verifiedAtUnix", -1),
        ),
    )
    if value != expected:
        fail("durability evidence binding rejected")
    confirmation = RemoteDurabilityConfirmation(
        backup_id=context.backup_id,
        artifact_sha256=pair.artifact_sha256,
        manifest_sha256=pair.manifest_sha256,
        destination_verified=value["destinationVerified"],
        verification_source=value["verificationSource"],
        durable_write_confirmed=value["durableWriteConfirmed"],
        durability_confirmation=value["durabilityConfirmation"],
        remote_object_set_id=value["remoteObjectSetId"],
        verified_at_unix=value["verifiedAtUnix"],
    )
    _validate_confirmation(confirmation, context, pair, now_unix)
    return value


def _atomic_evidence(path: Path, content: bytes) -> None:
    if os.path.lexists(path):
        fail("durability evidence reuse rejected")
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            if hasattr(os, "fchown"):
                os.fchown(stream.fileno(), 0, 0)
            if hasattr(os, "fchmod"):
                os.fchmod(stream.fileno(), 0o600)
            else:
                os.chmod(temporary, 0o600)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path, follow_symlinks=False)
        if hasattr(os, "O_DIRECTORY"):
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    except OSError as error:
        raise DurabilityError("durability evidence publication rejected") from error
    finally:
        temporary.unlink(missing_ok=True)


def perform_durability(
    context: DurabilityContext,
    adapter: RemoteDurabilityAdapter,
    *,
    source_directory: Path = PRODUCTION_BACKUP_DIRECTORY,
    evidence_directory: Path = EVIDENCE_DIRECTORY,
    now_unix: int | None = None,
) -> dict[str, Any]:
    context.validate()
    _require_plain_directory(source_directory, "backup source directory")
    _require_plain_directory(evidence_directory, "durability evidence directory")
    if source_directory == evidence_directory:
        fail("remote durability source separation rejected")
    now = int(time.time()) if now_unix is None else now_unix
    _require_integer(now, "durability clock", minimum=1)
    pair = inspect_backup_pair(source_directory, context.backup_id)
    try:
        confirmation = adapter.copy_and_verify(pair, now)
    except DurabilityError:
        raise
    except Exception as error:
        raise DurabilityError("remote durability operation failed") from error
    _validate_confirmation(confirmation, context, pair, now)
    content = canonical_bytes(evidence_value(context, pair, confirmation))
    evidence_path = evidence_directory / f"deployment-{context.deployment_id}.json"
    _atomic_evidence(evidence_path, content)
    try:
        persisted = evidence_path.read_bytes()
    except OSError as error:
        raise DurabilityError("durability evidence readback rejected") from error
    return validate_evidence_bytes(persisted, context, pair, now)


def _configuration_unavailable(message: str, error: BaseException | None = None) -> NoReturn:
    if error is None:
        raise DurabilityUnavailable(message)
    raise DurabilityUnavailable(message) from error


def _validate_windows_sftp_configuration(value: dict[str, Any]) -> WindowsSftpConfiguration:
    try:
        _require_exact_keys(
            value,
            frozenset({
                "schemaVersion", "state", "adapter", "host", "port", "username", "remoteDirectory",
            }),
            "durability configuration",
        )
        if value.get("adapter") != "windows-sftp-v1":
            fail("durability adapter rejected")
        host = value.get("host")
        if not isinstance(host, str) or len(host) > 45:
            fail("SFTP host rejected")
        try:
            address = ipaddress.ip_address(host)
        except ValueError as error:
            raise DurabilityError("SFTP host rejected") from error
        if address.version != 4 or address not in TAILSCALE_IPV4_NETWORK or str(address) != host:
            fail("SFTP host rejected")
        port = _require_integer(value.get("port"), "SFTP port", minimum=1)
        if port > 65_535:
            fail("SFTP port rejected")
        username = value.get("username")
        if username != "yolpol-backup":
            fail("SFTP username rejected")
        remote_directory = value.get("remoteDirectory")
        if remote_directory != SFTP_PRODUCTION_DIRECTORY:
            fail("SFTP remote directory rejected")
        return WindowsSftpConfiguration(
            host=host,
            port=port,
            username=username,
            remote_directory=remote_directory,
        )
    except DurabilityError as error:
        _configuration_unavailable("remote durability configuration rejected", error)


def _secure_root_file(path: Path, mode: int, maximum: int, label: str) -> os.stat_result:
    try:
        metadata = path.lstat()
    except OSError as error:
        _configuration_unavailable(f"{label} rejected", error)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != mode
        or metadata.st_size <= 0
        or metadata.st_size > maximum
    ):
        _configuration_unavailable(f"{label} rejected")
    return metadata


def _secure_root_directory(path: Path, mode: int, label: str) -> None:
    try:
        metadata = path.lstat()
        resolved = path.resolve(strict=True)
    except OSError as error:
        _configuration_unavailable(f"{label} rejected", error)
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != mode
        or resolved != path
    ):
        _configuration_unavailable(f"{label} rejected")


def _validate_fixed_executable(path: Path, label: str) -> None:
    try:
        metadata = path.lstat()
    except OSError as error:
        _configuration_unavailable(f"{label} rejected", error)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) & 0o022
        or not os.access(path, os.X_OK)
    ):
        _configuration_unavailable(f"{label} rejected")
    for ancestor in path.parents:
        try:
            ancestor_metadata = ancestor.lstat()
        except OSError as error:
            _configuration_unavailable(f"{label} ancestor rejected", error)
        if (
            not stat.S_ISDIR(ancestor_metadata.st_mode)
            or ancestor_metadata.st_uid != 0
            or ancestor_metadata.st_gid != 0
            or stat.S_IMODE(ancestor_metadata.st_mode) & 0o022
        ):
            _configuration_unavailable(f"{label} ancestor rejected")


def _validate_sftp_executable() -> None:
    _validate_fixed_executable(SFTP_EXECUTABLE, "SFTP executable")


def _validate_prlimit_executable() -> None:
    _validate_fixed_executable(PRLIMIT_EXECUTABLE, "prlimit executable")


def _validate_openssl_executable() -> None:
    _validate_fixed_executable(OPENSSL_EXECUTABLE, "OpenSSL executable")


def _validate_windows_receipt_public_key_content() -> None:
    try:
        data = WINDOWS_RECEIPT_PUBLIC_KEY_PATH.read_bytes()
        text = data.decode("ascii", "strict")
    except (OSError, UnicodeError) as error:
        _configuration_unavailable("Windows receipt verification public key rejected", error)
    normalized = text.replace("\r\n", "\n")
    if "\r" in normalized:
        _configuration_unavailable("Windows receipt verification public key rejected")
    lines = normalized.splitlines()
    if (
        len(lines) < 3
        or lines[0] != "-----BEGIN PUBLIC KEY-----"
        or lines[-1] != "-----END PUBLIC KEY-----"
    ):
        _configuration_unavailable("Windows receipt verification public key rejected")
    body_lines = lines[1:-1]
    if any(
        not line
        or len(line) > 64
        or re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", line) is None
        for line in body_lines
    ):
        _configuration_unavailable("Windows receipt verification public key rejected")
    try:
        decoded = base64.b64decode("".join(body_lines), validate=True)
    except ValueError as error:
        _configuration_unavailable("Windows receipt verification public key rejected", error)
    if not decoded:
        _configuration_unavailable("Windows receipt verification public key rejected")


def _validate_openssl_public_key_output(output: bytes) -> None:
    if not output or len(output) > MAX_OPENSSL_PUBLIC_KEY_OUTPUT_BYTES:
        _configuration_unavailable("Windows receipt verification public key rejected")
    try:
        lines = output.decode("ascii", "strict").splitlines()
    except UnicodeError as error:
        _configuration_unavailable("Windows receipt verification public key rejected", error)
    if lines and lines[0] == "Key is valid":
        lines = lines[1:]
    if (
        len(lines) < 4
        or lines[0] != f"Public-Key: ({WINDOWS_RECEIPT_PUBLIC_KEY_BITS} bit)"
        or lines[1] != "Modulus:"
        or not lines[-1].startswith("Exponent: ")
    ):
        _configuration_unavailable("Windows receipt verification public key rejected")


def _run_openssl_public_key_preflight() -> None:
    try:
        result = subprocess.run(
            [
                str(OPENSSL_EXECUTABLE),
                "pkey",
                "-pubin",
                "-in",
                str(WINDOWS_RECEIPT_PUBLIC_KEY_PATH),
                "-pubcheck",
                "-text_pub",
                "-noout",
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=OPENSSL_TIMEOUT_SECONDS,
            env={"HOME": "/root", "LC_ALL": "C", "PATH": "/usr/bin:/bin"},
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        _configuration_unavailable("Windows receipt verification public key rejected", error)
    if result.returncode != 0:
        _configuration_unavailable("Windows receipt verification public key rejected")
    _validate_openssl_public_key_output(result.stdout)


def _validate_windows_receipt_verification_authority() -> None:
    _secure_root_directory(SFTP_SECRET_DIRECTORY, 0o700, "SFTP trust directory")
    _secure_root_file(
        WINDOWS_RECEIPT_PUBLIC_KEY_PATH,
        0o600,
        MAX_WINDOWS_RECEIPT_PUBLIC_KEY_BYTES,
        "Windows receipt verification public key",
    )
    _validate_windows_receipt_public_key_content()
    _validate_openssl_executable()
    _run_openssl_public_key_preflight()


def _validate_activation_files() -> None:
    _secure_root_directory(SFTP_SECRET_DIRECTORY, 0o700, "SFTP trust directory")
    _secure_root_file(SFTP_KEY_PATH, 0o600, MAX_PRIVATE_KEY_BYTES, "SFTP private key")
    _secure_root_file(SFTP_KNOWN_HOSTS_PATH, 0o600, MAX_KNOWN_HOSTS_BYTES, "SFTP known hosts")
    _secure_root_file(
        WINDOWS_RECEIPT_PUBLIC_KEY_PATH,
        0o600,
        MAX_WINDOWS_RECEIPT_PUBLIC_KEY_BYTES,
        "Windows receipt verification public key",
    )
    _validate_windows_receipt_public_key_content()
    _secure_root_directory(VERIFICATION_TEMP_DIRECTORY, 0o700, "verification temporary directory")
    _validate_sftp_executable()
    _validate_prlimit_executable()
    _validate_openssl_executable()
    _run_openssl_public_key_preflight()


def _sftp_arguments(configuration: WindowsSftpConfiguration) -> list[str]:
    return [
        str(SFTP_EXECUTABLE),
        "-F", "none",
        "-b", "-",
        "-oBatchMode=yes",
        "-oStrictHostKeyChecking=yes",
        "-oUpdateHostKeys=no",
        f"-oUserKnownHostsFile={SFTP_KNOWN_HOSTS_PATH}",
        f"-oGlobalKnownHostsFile={SFTP_KNOWN_HOSTS_PATH}",
        f"-oIdentityFile={SFTP_KEY_PATH}",
        "-oIdentitiesOnly=yes",
        "-oPreferredAuthentications=publickey",
        "-oPasswordAuthentication=no",
        "-oKbdInteractiveAuthentication=no",
        "-oChallengeResponseAuthentication=no",
        "-oNumberOfPasswordPrompts=0",
        "-oGSSAPIAuthentication=no",
        "-oClearAllForwardings=yes",
        "-oForwardAgent=no",
        "-oForwardX11=no",
        "-oPermitLocalCommand=no",
        "-oRequestTTY=no",
        "-oProxyCommand=none",
        "-oProxyJump=none",
        "-oHostKeyAlgorithms=ssh-ed25519",
        "-oPubkeyAcceptedAlgorithms=ssh-ed25519",
        "-oConnectTimeout=15",
        "-oConnectionAttempts=1",
        "-oServerAliveInterval=10",
        "-oServerAliveCountMax=3",
        "-P", str(configuration.port),
        f"{configuration.username}@{configuration.host}",
    ]


def _run_sftp_upload(
    configuration: WindowsSftpConfiguration,
    object_directory: str,
    artifact_staged: Path,
    artifact_remote: str,
    manifest_staged: Path,
    manifest_remote: str,
) -> None:
    for remote_path in (object_directory, artifact_remote, manifest_remote):
        _validate_remote_sftp_path(remote_path)
    batch = (
        f"mkdir {object_directory}\n"
        f"put {_quoted_local_sftp_path(artifact_staged)} {artifact_remote}.partial\n"
        f"put {_quoted_local_sftp_path(manifest_staged)} {manifest_remote}.partial\n"
        f"rename {artifact_remote}.partial {artifact_remote}\n"
        f"rename {manifest_remote}.partial {manifest_remote}\n"
    ).encode("utf-8")
    try:
        result = subprocess.run(
            _sftp_arguments(configuration),
            input=batch,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=SFTP_TIMEOUT_SECONDS,
            env={"HOME": "/root", "LC_ALL": "C", "PATH": "/usr/bin:/bin"},
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise DurabilityError("SFTP operation failed") from error
    if result.returncode != 0:
        fail("SFTP operation failed")


def _validate_remote_sftp_path(path: str) -> None:
    if (
        not isinstance(path, str)
        or SFTP_REMOTE_PATH.fullmatch(path) is None
        or "//" in path
        or any(part in {"", ".", ".."} for part in path.split("/")[1:])
    ):
        fail("SFTP remote path rejected")


def _validate_sftp_download_local_path(path: Path) -> None:
    if not isinstance(path, Path):
        fail("SFTP local path rejected")
    try:
        temporary_root = VERIFICATION_TEMP_DIRECTORY.resolve(strict=True)
        parent_metadata = path.parent.lstat()
        parent = path.parent.resolve(strict=True)
    except OSError as error:
        raise DurabilityError("SFTP local path rejected") from error
    if (
        not stat.S_ISDIR(parent_metadata.st_mode)
        or parent != path.parent
        or parent.parent != temporary_root
    ):
        fail("SFTP local path rejected")
    try:
        path.lstat()
    except FileNotFoundError:
        return
    except OSError as error:
        raise DurabilityError("SFTP local path rejected") from error
    fail("SFTP local path rejected")


def _run_bounded_sftp_get(
    configuration: WindowsSftpConfiguration,
    remote_path: str,
    local_path: Path,
    maximum_size: int,
    *,
    timeout_seconds: int = SFTP_TIMEOUT_SECONDS,
) -> None:
    _validate_remote_sftp_path(remote_path)
    _validate_sftp_download_local_path(local_path)
    maximum_size = _require_integer(maximum_size, "SFTP download size limit", minimum=1)
    timeout_seconds = _require_integer(timeout_seconds, "SFTP timeout", minimum=1)
    batch = f"get {remote_path} {_quoted_local_sftp_path(local_path)}\n".encode("utf-8")
    try:
        result = subprocess.run(
            [
                str(PRLIMIT_EXECUTABLE),
                "--core=0:0",
                f"--fsize={maximum_size}:{maximum_size}",
                "--",
                *_sftp_arguments(configuration),
            ],
            input=batch,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=timeout_seconds,
            env={"HOME": "/root", "LC_ALL": "C", "PATH": "/usr/bin:/bin"},
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise DurabilityError("SFTP download failed") from error
    if result.returncode != 0:
        fail("SFTP download failed")


def _quoted_local_sftp_path(path: Path) -> str:
    text = str(path)
    if "\x00" in text or "\r" in text or "\n" in text:
        fail("SFTP local path rejected")
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _remove_temporary_file(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError as error:
        raise DurabilityError("SFTP temporary cleanup failed") from error


def _required_temporary_free_bytes(pair: BackupPair) -> int:
    artifact_size = _require_integer(pair.artifact_size, "backup artifact size", minimum=1)
    manifest_size = _require_integer(pair.manifest_size, "backup manifest size", minimum=1)
    if manifest_size > MAX_MANIFEST_BYTES:
        fail("backup manifest size rejected")
    return (
        2 * artifact_size
        + 2 * manifest_size
        + TEMPORARY_PROTOCOL_OVERHEAD_BYTES
        + TEMPORARY_FILESYSTEM_SAFETY_RESERVE_BYTES
    )


def _admit_temporary_capacity(pair: BackupPair) -> None:
    required = _required_temporary_free_bytes(pair)
    try:
        free = shutil.disk_usage(VERIFICATION_TEMP_DIRECTORY).free
    except (AttributeError, OSError, TypeError, ValueError) as error:
        raise DurabilityError("verification temporary capacity unavailable") from error
    if isinstance(free, bool) or not isinstance(free, int) or free < required:
        fail("verification temporary capacity rejected")


def _remote_object_directory(configuration: WindowsSftpConfiguration, backup_id: str) -> str:
    _require_string(backup_id, BACKUP_ID, "backup identity")
    if configuration.remote_directory != SFTP_PRODUCTION_DIRECTORY:
        fail("SFTP remote directory rejected")
    return f"{configuration.remote_directory}/{backup_id}"


def _durable_object_directory(backup_id: str) -> str:
    _require_string(backup_id, BACKUP_ID, "backup identity")
    return f"{SFTP_DURABLE_DIRECTORY}/{backup_id}"


def _receipt_remote_path(backup_id: str) -> str:
    _require_string(backup_id, BACKUP_ID, "backup identity")
    return f"{SFTP_RECEIPT_DIRECTORY}/{backup_id}.json"


def _receipt_signature_remote_path(backup_id: str) -> str:
    _require_string(backup_id, BACKUP_ID, "backup identity")
    return f"{SFTP_RECEIPT_DIRECTORY}/{backup_id}.sig"


def _windows_remote_object_set_id(backup_id: str) -> str:
    _require_string(backup_id, BACKUP_ID, "backup identity")
    return f"windows-sftp-v1:{SFTP_DURABLE_DIRECTORY}/{backup_id}"


def _validate_windows_receipt(data: bytes, pair: BackupPair) -> dict[str, Any]:
    value = strict_object(data, MAX_DURABILITY_RECEIPT_BYTES, "Windows durability receipt")
    if canonical_bytes(value) != data:
        fail("non-canonical Windows durability receipt rejected")
    _require_exact_keys(value, WINDOWS_RECEIPT_KEYS, "Windows durability receipt")
    _require_integer(value.get("schemaVersion"), "Windows durability receipt schema version", expected=1)
    if value.get("backupId") != pair.backup_id:
        fail("Windows durability receipt backup identity rejected")
    if value.get("artifactSha256") != pair.artifact_sha256:
        fail("Windows durability receipt artifact checksum rejected")
    if value.get("manifestSha256") != pair.manifest_sha256:
        fail("Windows durability receipt manifest checksum rejected")
    artifact_size = _require_integer(
        value.get("artifactSize"),
        "Windows durability receipt artifact size",
        minimum=1,
    )
    if artifact_size != pair.artifact_size:
        fail("Windows durability receipt artifact size rejected")
    manifest_size = _require_integer(
        value.get("manifestSize"),
        "Windows durability receipt manifest size",
        minimum=1,
    )
    if manifest_size != pair.manifest_size:
        fail("Windows durability receipt manifest size rejected")
    if value.get("durabilityConfirmation") != WINDOWS_DURABILITY_CONFIRMATION:
        fail("Windows durability receipt confirmation rejected")
    if value.get("remoteObjectSetId") != _windows_remote_object_set_id(pair.backup_id):
        fail("Windows durability receipt remote identity rejected")
    return value


def _poll_windows_receipt(
    configuration: WindowsSftpConfiguration,
    pair: BackupPair,
    temporary: Path,
) -> tuple[bytes, Path]:
    receipt_remote = _receipt_remote_path(pair.backup_id)
    signature_remote = _receipt_signature_remote_path(pair.backup_id)
    deadline = time.monotonic() + SFTP_RECEIPT_POLL_TIMEOUT_SECONDS
    for attempt in range(1, SFTP_RECEIPT_MAX_ATTEMPTS + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        receipt_local = temporary / f"receipt-{attempt}.json"
        signature_local = temporary / f"receipt-{attempt}.sig"
        _remove_temporary_file(receipt_local)
        _remove_temporary_file(signature_local)
        try:
            _run_bounded_sftp_get(
                configuration,
                receipt_remote,
                receipt_local,
                MAX_DURABILITY_RECEIPT_BYTES,
                timeout_seconds=max(
                    1,
                    min(SFTP_RECEIPT_ATTEMPT_TIMEOUT_SECONDS, math.ceil(remaining)),
                ),
            )
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise DurabilityError("Windows durability receipt is unavailable")
            _run_bounded_sftp_get(
                configuration,
                signature_remote,
                signature_local,
                WINDOWS_RECEIPT_SIGNATURE_BYTES,
                timeout_seconds=max(
                    1,
                    min(SFTP_RECEIPT_ATTEMPT_TIMEOUT_SECONDS, math.ceil(remaining)),
                ),
            )
        except DurabilityError:
            _remove_temporary_file(receipt_local)
            _remove_temporary_file(signature_local)
            remaining = deadline - time.monotonic()
            if remaining <= 0 or attempt == SFTP_RECEIPT_MAX_ATTEMPTS:
                break
            time.sleep(min(SFTP_RECEIPT_POLL_INTERVAL_SECONDS, remaining))
            continue
        metadata = _regular_file(receipt_local, temporary, "Windows durability receipt readback")
        if metadata.st_size > MAX_DURABILITY_RECEIPT_BYTES:
            fail("Windows durability receipt readback rejected")
        signature_metadata = _regular_file(
            signature_local,
            temporary,
            "Windows durability receipt signature readback",
        )
        if signature_metadata.st_size != WINDOWS_RECEIPT_SIGNATURE_BYTES:
            fail("Windows durability receipt signature length rejected")
        try:
            receipt_data = receipt_local.read_bytes()
            _validate_windows_receipt(receipt_data, pair)
            return receipt_data, signature_local
        except OSError as error:
            raise DurabilityError("Windows durability receipt readback rejected") from error
    raise DurabilityUnavailable("Windows durability receipt is unavailable")


def _write_verification_message(path: Path, receipt_data: bytes) -> None:
    descriptor = -1
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        if hasattr(os, "fchmod"):
            os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(WINDOWS_RECEIPT_DOMAIN_SEPARATOR)
            stream.write(receipt_data)
            stream.flush()
            os.fsync(stream.fileno())
    except OSError as error:
        raise DurabilityError("Windows durability receipt verification staging failed") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def _run_openssl_receipt_verification(signature_path: Path, message_path: Path) -> None:
    arguments = [
        str(OPENSSL_EXECUTABLE),
        "dgst",
        "-sha256",
        "-verify",
        str(WINDOWS_RECEIPT_PUBLIC_KEY_PATH),
        "-signature",
        str(signature_path),
        "-sigopt",
        "rsa_padding_mode:pss",
        "-sigopt",
        "rsa_mgf1_md:sha256",
        "-sigopt",
        "rsa_pss_saltlen:digest",
        str(message_path),
    ]
    try:
        result = subprocess.run(
            arguments,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=OPENSSL_TIMEOUT_SECONDS,
            env={"HOME": "/root", "LC_ALL": "C", "PATH": "/usr/bin:/bin"},
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise DurabilityError("Windows durability receipt signature verification failed") from error
    if result.returncode != 0:
        fail("Windows durability receipt signature verification failed")


def _verify_windows_receipt_signature(
    receipt_data: bytes,
    signature_path: Path,
    temporary: Path,
) -> None:
    signature_metadata = _regular_file(
        signature_path,
        temporary,
        "Windows durability receipt signature readback",
    )
    if signature_metadata.st_size != WINDOWS_RECEIPT_SIGNATURE_BYTES:
        fail("Windows durability receipt signature length rejected")
    _validate_windows_receipt_verification_authority()
    message_path = temporary / "windows-receipt-verification-message.bin"
    _write_verification_message(message_path, receipt_data)
    _run_openssl_receipt_verification(signature_path, message_path)


def _stage_validated_file(
    source: Path,
    destination: Path,
    expected_sha256: str,
    *,
    expected_size: int | None = None,
    maximum_size: int | None = None,
) -> int:
    source_flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        source_flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        source_flags |= os.O_NOFOLLOW
    destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_CLOEXEC"):
        destination_flags |= os.O_CLOEXEC
    source_descriptor = -1
    destination_descriptor = -1
    digest = hashlib.sha256()
    size = 0
    try:
        source_descriptor = os.open(source, source_flags)
        source_metadata = os.fstat(source_descriptor)
        if not stat.S_ISREG(source_metadata.st_mode):
            fail("backup staging source rejected")
        destination_descriptor = os.open(destination, destination_flags, 0o600)
        if hasattr(os, "fchmod"):
            os.fchmod(destination_descriptor, 0o600)
        with (
            os.fdopen(source_descriptor, "rb", closefd=False) as source_stream,
            os.fdopen(destination_descriptor, "wb", closefd=False) as destination_stream,
        ):
            while block := source_stream.read(1024 * 1024):
                size += len(block)
                if maximum_size is not None and size > maximum_size:
                    fail("backup staging size rejected")
                digest.update(block)
                destination_stream.write(block)
            destination_stream.flush()
            os.fsync(destination_stream.fileno())
    except DurabilityError:
        raise
    except OSError as error:
        raise DurabilityError("backup staging failed") from error
    finally:
        if source_descriptor >= 0:
            os.close(source_descriptor)
        if destination_descriptor >= 0:
            os.close(destination_descriptor)
    if size <= 0 or (expected_size is not None and size != expected_size) or digest.hexdigest() != expected_sha256:
        fail("backup staging verification rejected")
    return size


class WindowsSftpDurabilityAdapter:
    """Fixed SFTP transport plus Windows receipt and final-store verification."""

    def __init__(self, configuration: WindowsSftpConfiguration) -> None:
        self.configuration = configuration

    def copy_and_verify(self, pair: BackupPair, now_unix: int) -> RemoteDurabilityConfirmation:
        object_directory = _remote_object_directory(self.configuration, pair.backup_id)
        artifact_remote = f"{object_directory}/{pair.artifact_filename}"
        manifest_remote = f"{object_directory}/{pair.manifest_filename}"
        durable_directory = _durable_object_directory(pair.backup_id)
        durable_artifact_remote = f"{durable_directory}/{pair.artifact_filename}"
        durable_manifest_remote = f"{durable_directory}/{pair.manifest_filename}"
        try:
            _admit_temporary_capacity(pair)
            with tempfile.TemporaryDirectory(
                prefix=f"verify-{pair.backup_id}-",
                dir=VERIFICATION_TEMP_DIRECTORY,
            ) as temporary_name:
                temporary = Path(temporary_name)
                os.chmod(temporary, 0o700)
                artifact_staged = temporary / f"upload-{pair.artifact_filename}"
                manifest_staged = temporary / f"upload-{pair.manifest_filename}"
                artifact_readback = temporary / f"durable-{pair.artifact_filename}"
                manifest_readback = temporary / f"durable-{pair.manifest_filename}"
                _stage_validated_file(
                    pair.artifact_path,
                    artifact_staged,
                    pair.artifact_sha256,
                    expected_size=pair.artifact_size,
                )
                _stage_validated_file(
                    pair.manifest_path,
                    manifest_staged,
                    pair.manifest_sha256,
                    expected_size=pair.manifest_size,
                    maximum_size=MAX_MANIFEST_BYTES,
                )
                _run_sftp_upload(
                    self.configuration,
                    object_directory,
                    artifact_staged,
                    artifact_remote,
                    manifest_staged,
                    manifest_remote,
                )
                receipt_data, signature_path = _poll_windows_receipt(
                    self.configuration,
                    pair,
                    temporary,
                )
                _verify_windows_receipt_signature(
                    receipt_data,
                    signature_path,
                    temporary,
                )
                _run_bounded_sftp_get(
                    self.configuration,
                    durable_artifact_remote,
                    artifact_readback,
                    pair.artifact_size,
                )
                _run_bounded_sftp_get(
                    self.configuration,
                    durable_manifest_remote,
                    manifest_readback,
                    pair.manifest_size,
                )
                artifact_metadata = _regular_file(artifact_readback, temporary, "SFTP artifact readback")
                manifest_metadata = _regular_file(manifest_readback, temporary, "SFTP manifest readback")
                if artifact_metadata.st_size != pair.artifact_size:
                    fail("SFTP artifact readback rejected")
                if manifest_metadata.st_size != pair.manifest_size:
                    fail("SFTP manifest readback rejected")
                if _sha256_file(artifact_readback) != pair.artifact_sha256:
                    fail("SFTP artifact checksum rejected")
                if _sha256_file(manifest_readback) != pair.manifest_sha256:
                    fail("SFTP manifest checksum rejected")
        except DurabilityError:
            raise
        except OSError as error:
            raise DurabilityError("SFTP destination readback failed") from error

        return RemoteDurabilityConfirmation(
            backup_id=pair.backup_id,
            artifact_sha256=pair.artifact_sha256,
            manifest_sha256=pair.manifest_sha256,
            destination_verified=True,
            verification_source="destination",
            durable_write_confirmed=True,
            durability_confirmation=WINDOWS_DURABILITY_CONFIRMATION,
            remote_object_set_id=_windows_remote_object_set_id(pair.backup_id),
            verified_at_unix=now_unix,
        )


def _validate_configuration_bytes(data: bytes) -> dict[str, Any]:
    try:
        value = strict_object(data, MAX_CONFIG_BYTES, "durability configuration")
        if canonical_bytes(value) != data:
            fail("non-canonical durability configuration rejected")
        _require_integer(value.get("schemaVersion"), "durability configuration schema version", expected=1)
    except DurabilityError as error:
        raise DurabilityUnavailable("remote durability configuration rejected") from error
    if value.get("state") == "unconfigured":
        try:
            _require_exact_keys(value, frozenset({"schemaVersion", "state"}), "durability configuration")
        except DurabilityError as error:
            raise DurabilityUnavailable("remote durability configuration rejected") from error
    elif value.get("state") == "configured":
        _validate_windows_sftp_configuration(value)
    else:
        raise DurabilityUnavailable("remote durability configuration rejected")
    return value


def _load_configuration(path: Path | None = None) -> dict[str, Any]:
    path = CONFIG_PATH if path is None else path
    try:
        metadata = path.lstat()
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != 0
            or metadata.st_gid != 0
            or stat.S_IMODE(metadata.st_mode) != 0o600
        ):
            raise DurabilityUnavailable("remote durability is not configured")
        data = path.read_bytes()
    except OSError as error:
        raise DurabilityUnavailable("remote durability is not configured") from error
    return _validate_configuration_bytes(data)


def execute_production_durability(context: DurabilityContext) -> dict[str, Any]:
    """Run the one reviewed adapter selected by the fixed root-owned configuration."""
    context.validate()
    value = _load_configuration()
    if value.get("state") != "configured":
        raise DurabilityUnavailable("remote durability adapter is unavailable")
    configuration = _validate_windows_sftp_configuration(value)
    _validate_activation_files()
    return perform_durability(context, WindowsSftpDurabilityAdapter(configuration))


def bounded_summary(evidence: dict[str, Any]) -> dict[str, Any]:
    """Return the only evidence fields permitted in the deployment ledger."""
    _require_exact_keys(evidence, EVIDENCE_KEYS, "durability evidence")
    return {
        "phaseC2BackupId": evidence["backupId"],
        "phaseC2ArtifactSha256": evidence["artifactSha256"],
        "phaseC2ManifestSha256": evidence["manifestSha256"],
        "phaseC2RemoteObjectSetId": evidence["remoteObjectSetId"],
        "phaseC2VerifiedAtUnix": evidence["verifiedAtUnix"],
    }


__all__ = [
    "BackupPair",
    "DurabilityContext",
    "DurabilityError",
    "DurabilityUnavailable",
    "RemoteDurabilityAdapter",
    "RemoteDurabilityConfirmation",
    "WindowsSftpConfiguration",
    "WindowsSftpDurabilityAdapter",
    "bounded_summary",
    "execute_production_durability",
    "inspect_backup_pair",
    "perform_durability",
    "validate_evidence_bytes",
]
