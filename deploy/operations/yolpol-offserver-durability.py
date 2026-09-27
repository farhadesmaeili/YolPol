#!/usr/bin/python3
"""Provider-neutral Phase C2 off-server durability contract.

The installed controller imports this root-owned module directly.  No caller can
select an adapter, destination, executable, URL, or evidence path.  A concrete
remote adapter remains a separately reviewed activation.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NoReturn, Protocol


CONFIG_PATH = Path("/etc/yolpol/offserver-durability.json")
PRODUCTION_BACKUP_DIRECTORY = Path("/opt/yolpol/production/backups")
EVIDENCE_DIRECTORY = Path("/opt/yolpol/runtime/offserver-durability-evidence")
MAX_CONFIG_BYTES = 4_096
MAX_MANIFEST_BYTES = 65_536
MAX_EVIDENCE_BYTES = 8_192
MAX_EVIDENCE_AGE_SECONDS = 900
MAX_CLOCK_SKEW_SECONDS = 30

BACKUP_ID = re.compile(r"^yolpol-production-[0-9]{8}T[0-9]{6}Z(?:-[0-9a-f]{7,64})?$")
DEPLOYMENT_ID = re.compile(r"^[1-9][0-9]{0,19}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MIGRATION_FINGERPRINT = re.compile(r"^[A-Za-z0-9_.-]{1,128}:[0-9a-f]{64}$")
REMOTE_IDENTITY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$")
CONFIRMATION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")

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


def inspect_backup_pair(source_directory: Path, backup_id: str) -> BackupPair:
    _require_plain_directory(source_directory, "backup source directory")
    _require_string(backup_id, BACKUP_ID, "backup identity")
    artifact_filename = f"{backup_id}.dump.age"
    manifest_filename = f"{backup_id}.manifest.json"
    artifact_path = source_directory / artifact_filename
    manifest_path = source_directory / manifest_filename
    artifact_metadata = _regular_file(artifact_path, source_directory, "encrypted backup artifact")
    manifest_metadata = _regular_file(manifest_path, source_directory, "backup manifest")
    if artifact_metadata.st_size <= 0 or manifest_metadata.st_size <= 0 or manifest_metadata.st_size > MAX_MANIFEST_BYTES:
        fail("backup pair size rejected")
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


def _validate_configuration_bytes(data: bytes) -> dict[str, Any]:
    try:
        value = strict_object(data, MAX_CONFIG_BYTES, "durability configuration")
        _require_exact_keys(value, frozenset({"schemaVersion", "state"}), "durability configuration")
        if canonical_bytes(value) != data:
            fail("non-canonical durability configuration rejected")
        _require_integer(value.get("schemaVersion"), "durability configuration schema version", expected=1)
    except DurabilityError as error:
        raise DurabilityUnavailable("remote durability configuration rejected") from error
    if value.get("state") != "unconfigured":
        raise DurabilityUnavailable("remote durability adapter is unavailable")
    return value


def _load_configuration(path: Path | None = None) -> dict[str, Any]:
    path = CONFIG_PATH if path is None else path
    try:
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise DurabilityUnavailable("remote durability is not configured")
        data = path.read_bytes()
    except OSError as error:
        raise DurabilityUnavailable("remote durability is not configured") from error
    return _validate_configuration_bytes(data)


def execute_production_durability(context: DurabilityContext) -> dict[str, Any]:
    """Fail closed until a reviewed fixed provider adapter is implemented and activated."""
    context.validate()
    _load_configuration()
    raise DurabilityUnavailable("remote durability adapter is unavailable")


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
    "bounded_summary",
    "execute_production_durability",
    "inspect_backup_pair",
    "perform_durability",
    "validate_evidence_bytes",
]
