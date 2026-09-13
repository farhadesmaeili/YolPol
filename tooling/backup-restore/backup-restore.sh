#!/bin/sh

set -eu
set -o pipefail

readonly MANIFEST_FORMAT_VERSION=1
readonly REQUIRED_MIGRATION="0022_global_translation_settings"
readonly REQUIRED_MIGRATION_TIMESTAMP=1788832991886
readonly RESTORE_CONFIRMATION="RESTORE_TO_EMPTY_DATABASE"
readonly RETENTION_CONFIRMATION="DELETE_OLD_VERIFIED_BACKUPS"

PARTIAL_ARTIFACT=""
PARTIAL_MANIFEST=""
CREATE_LOCK=""
RETENTION_LIST=""

cleanup() {
  [ -z "$PARTIAL_ARTIFACT" ] || rm -f -- "$PARTIAL_ARTIFACT"
  [ -z "$PARTIAL_MANIFEST" ] || rm -f -- "$PARTIAL_MANIFEST"
  [ -z "$CREATE_LOCK" ] || rmdir -- "$CREATE_LOCK" 2>/dev/null || true
  [ -z "$RETENTION_LIST" ] || rm -f -- "$RETENTION_LIST"
}

trap cleanup EXIT
trap 'exit 130' HUP INT TERM

log_event() {
  level="$1"
  event="$2"
  stage="$3"
  result="$4"
  backup_id="${5:-}"
  duration_seconds="${6:-}"
  artifact_size="${7:-}"

  jq -cn \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg level "$level" \
    --arg event "$event" \
    --arg stage "$stage" \
    --arg result "$result" \
    --arg backupId "$backup_id" \
    --arg durationSeconds "$duration_seconds" \
    --arg artifactSizeBytes "$artifact_size" \
    '{timestamp:$timestamp,level:$level,event:$event,service:"backup-restore-operations",stage:$stage,result:$result}
      + (if $backupId == "" then {} else {backupId:$backupId} end)
      + (if $durationSeconds == "" then {} else {durationSeconds:($durationSeconds|tonumber)} end)
      + (if $artifactSizeBytes == "" then {} else {artifactSizeBytes:($artifactSizeBytes|tonumber)} end)'
}

fail() {
  log_event error "backup_restore.failed" "$1" failed "${2:-}" >&2
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing_tool"
}

resolve_backup_directory() {
  configured="${YOLPOL_BACKUP_DIRECTORY:-}"
  [ -n "$configured" ] || fail "backup_directory_configuration"
  case "$configured" in
    /*) ;;
    *) fail "backup_directory_configuration" ;;
  esac
  [ -d "$configured" ] || fail "backup_directory_missing"
  [ ! -L "$configured" ] || fail "backup_directory_symlink"
  BACKUP_DIRECTORY="$(realpath "$configured")"
  [ "$BACKUP_DIRECTORY" = "$configured" ] || fail "backup_directory_canonicalization"
  readonly BACKUP_DIRECTORY
}

validate_environment() {
  case "${1:-}" in
    development|staging|production) ;;
    *) return 1 ;;
  esac
}

validate_revision() {
  [ -z "${1:-}" ] || printf '%s\n' "$1" | grep -Eq '^[0-9a-f]{7,64}$'
}

validate_backup_id() {
  printf '%s\n' "${1:-}" | grep -Eq '^yolpol-(development|staging|production)-[0-9]{8}T[0-9]{6}Z(-[0-9a-f]{7,64})?$'
}

environment_from_backup_id() {
  case "$1" in
    yolpol-development-*) printf 'development\n' ;;
    yolpol-staging-*) printf 'staging\n' ;;
    yolpol-production-*) printf 'production\n' ;;
    *) return 1 ;;
  esac
}

artifact_path() {
  printf '%s/%s.dump.age\n' "$BACKUP_DIRECTORY" "$1"
}

manifest_path() {
  printf '%s/%s.manifest.json\n' "$BACKUP_DIRECTORY" "$1"
}

verify_pair() {
  backup_id="$1"
  validate_backup_id "$backup_id" || return 1
  expected_environment="$(environment_from_backup_id "$backup_id")" || return 1
  identity_suffix="${backup_id#yolpol-$expected_environment-}"
  compact_timestamp="$(printf '%s' "$identity_suffix" | cut -c 1-16)"
  expected_created_at="$(printf '%s-%s-%sT%s:%s:%sZ' \
    "$(printf '%s' "$compact_timestamp" | cut -c 1-4)" \
    "$(printf '%s' "$compact_timestamp" | cut -c 5-6)" \
    "$(printf '%s' "$compact_timestamp" | cut -c 7-8)" \
    "$(printf '%s' "$compact_timestamp" | cut -c 10-11)" \
    "$(printf '%s' "$compact_timestamp" | cut -c 12-13)" \
    "$(printf '%s' "$compact_timestamp" | cut -c 14-15)")"
  expected_revision="${identity_suffix#"$compact_timestamp"}"
  expected_revision="${expected_revision#-}"
  artifact="$(artifact_path "$backup_id")"
  manifest="$(manifest_path "$backup_id")"

  [ -f "$artifact" ] && [ ! -L "$artifact" ] || return 1
  [ -f "$manifest" ] && [ ! -L "$manifest" ] || return 1
  [ "$(dirname "$(realpath "$artifact")")" = "$BACKUP_DIRECTORY" ] || return 1
  [ "$(dirname "$(realpath "$manifest")")" = "$BACKUP_DIRECTORY" ] || return 1

  jq -e \
    --arg backupId "$backup_id" \
    --arg environment "$expected_environment" \
    --arg createdAt "$expected_created_at" \
    --arg applicationRevision "$expected_revision" \
    --arg filename "$backup_id.dump.age" \
    --arg requiredMigration "$REQUIRED_MIGRATION" \
    --argjson requiredMigrationTimestamp "$REQUIRED_MIGRATION_TIMESTAMP" \
    --argjson formatVersion "$MANIFEST_FORMAT_VERSION" \
    'type == "object"
      and .formatVersion == $formatVersion
      and .backupId == $backupId
      and .createdAt == $createdAt
      and .deploymentEnvironment == $environment
      and (if $applicationRevision == "" then .applicationRevision == null else .applicationRevision == $applicationRevision end)
      and (.postgresql | type == "object")
      and (.postgresql.majorVersion | type == "number" and . == 17)
      and (.postgresql.serverVersion | type == "string" and length > 0)
      and (.postgresql.clientVersion | type == "string" and length > 0)
      and .dump.format == "custom"
      and .encryption.scheme == "age-x25519"
      and .artifact.filename == $filename
      and (.artifact.sizeBytes | type == "number" and . > 0 and floor == .)
      and (.artifact.sha256 | type == "string" and test("^[0-9a-f]{64}$"))
      and (.schema.latestMigrationTimestamp | type == "number" and . >= 0 and floor == .)
      and .schema.requiredMigration == $requiredMigration
      and .schema.requiredMigrationTimestamp == $requiredMigrationTimestamp' \
    "$manifest" >/dev/null 2>&1 || return 1

  expected_size="$(jq -r '.artifact.sizeBytes' "$manifest")" || return 1
  actual_size="$(stat -c '%s' "$artifact")" || return 1
  [ "$actual_size" = "$expected_size" ] || return 1

  expected_checksum="$(jq -r '.artifact.sha256' "$manifest")" || return 1
  actual_checksum="$(sha256sum "$artifact" | awk '{print $1}')" || return 1
  [ "$actual_checksum" = "$expected_checksum" ] || return 1
}

require_database_url() {
  [ -n "${DATABASE_URL:-}" ] || fail "database_configuration"
}

require_identity_file() {
  identity_file="${YOLPOL_BACKUP_AGE_IDENTITY_FILE:-}"
  [ -n "$identity_file" ] || fail "restore_identity_configuration" "${1:-}"
  [ -f "$identity_file" ] && [ ! -L "$identity_file" ] && [ -s "$identity_file" ] \
    || fail "restore_identity_unavailable" "${1:-}"
  IDENTITY_FILE="$identity_file"
  readonly IDENTITY_FILE
}

create_backup() {
  require_command pg_dump
  require_command psql
  require_command age
  require_command jq
  require_command sha256sum
  resolve_backup_directory
  require_database_url

  environment="${YOLPOL_DEPLOYMENT_ENVIRONMENT:-}"
  validate_environment "$environment" || fail "deployment_environment_configuration"
  revision="${YOLPOL_GIT_REVISION:-}"
  validate_revision "$revision" || fail "application_revision_configuration"
  recipient="${YOLPOL_BACKUP_AGE_RECIPIENT:-}"
  printf '%s\n' "$recipient" | grep -Eq '^age1[0-9a-z]{58}$' \
    || fail "encryption_recipient_configuration"

  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  compact_timestamp="$(printf '%s' "$created_at" | tr -d ':-')"
  backup_id="yolpol-$environment-$compact_timestamp"
  [ -z "$revision" ] || backup_id="$backup_id-$revision"
  validate_backup_id "$backup_id" || fail "backup_identifier_generation"

  artifact="$(artifact_path "$backup_id")"
  manifest="$(manifest_path "$backup_id")"
  PARTIAL_ARTIFACT="$artifact.partial.$$"
  PARTIAL_MANIFEST="$manifest.partial.$$"
  CREATE_LOCK="$BACKUP_DIRECTORY/.$backup_id.lock"
  [ ! -e "$artifact" ] && [ ! -e "$manifest" ] || fail "backup_identifier_collision" "$backup_id"
  mkdir "$CREATE_LOCK" 2>/dev/null || fail "backup_concurrency_lock" "$backup_id"
  umask 077

  started_at="$(date +%s)"
  log_event info "backup.create.started" dump started "$backup_id"

  server_version="$(psql --dbname "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'show server_version' 2>/dev/null)" \
    || fail "database_version" "$backup_id"
  server_version_number="$(psql --dbname "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'show server_version_num' 2>/dev/null)" \
    || fail "database_version" "$backup_id"
  case "$server_version_number" in (*[!0-9]*|'') fail "database_version" "$backup_id" ;; esac
  server_major=$((server_version_number / 10000))
  client_version="$(pg_dump --version)"
  client_major="$(printf '%s\n' "$client_version" | sed -n 's/.* \([0-9][0-9]*\)\..*/\1/p')"
  [ "$server_major" = "17" ] && [ "$client_major" = "$server_major" ] \
    || fail "postgresql_major_version_mismatch" "$backup_id"

  migration_timestamp="$(psql --dbname "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 \
    -c 'select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations' 2>/dev/null)" \
    || fail "migration_state" "$backup_id"
  case "$migration_timestamp" in (*[!0-9]*|'') fail "migration_state" "$backup_id" ;; esac

  if ! pg_dump --dbname "$DATABASE_URL" --format=custom --no-owner --no-privileges 2>/dev/null \
    | age --encrypt --recipient "$recipient" --output "$PARTIAL_ARTIFACT" 2>/dev/null; then
    fail "dump_or_encryption" "$backup_id"
  fi

  [ -s "$PARTIAL_ARTIFACT" ] || fail "encrypted_artifact" "$backup_id"
  artifact_size="$(stat -c '%s' "$PARTIAL_ARTIFACT")"
  checksum="$(sha256sum "$PARTIAL_ARTIFACT" | awk '{print $1}')"

  jq -n \
    --argjson formatVersion "$MANIFEST_FORMAT_VERSION" \
    --arg backupId "$backup_id" \
    --arg createdAt "$created_at" \
    --arg deploymentEnvironment "$environment" \
    --arg applicationRevision "$revision" \
    --arg serverVersion "$server_version" \
    --arg clientVersion "$client_version" \
    --argjson majorVersion "$server_major" \
    --arg artifactFilename "$backup_id.dump.age" \
    --argjson artifactSize "$artifact_size" \
    --arg checksum "$checksum" \
    --argjson migrationTimestamp "$migration_timestamp" \
    --arg requiredMigration "$REQUIRED_MIGRATION" \
    --argjson requiredMigrationTimestamp "$REQUIRED_MIGRATION_TIMESTAMP" \
    '{
      formatVersion:$formatVersion,
      backupId:$backupId,
      createdAt:$createdAt,
      deploymentEnvironment:$deploymentEnvironment,
      applicationRevision:(if $applicationRevision == "" then null else $applicationRevision end),
      postgresql:{majorVersion:$majorVersion,serverVersion:$serverVersion,clientVersion:$clientVersion},
      dump:{format:"custom"},
      encryption:{scheme:"age-x25519"},
      artifact:{filename:$artifactFilename,sizeBytes:$artifactSize,sha256:$checksum},
      schema:{
        latestMigrationTimestamp:$migrationTimestamp,
        requiredMigration:$requiredMigration,
        requiredMigrationTimestamp:$requiredMigrationTimestamp
      }
    }' > "$PARTIAL_MANIFEST" || fail "manifest_generation" "$backup_id"

  jq -e . "$PARTIAL_MANIFEST" >/dev/null 2>&1 || fail "manifest_generation" "$backup_id"
  mv -- "$PARTIAL_MANIFEST" "$manifest" || fail "manifest_publication" "$backup_id"
  PARTIAL_MANIFEST=""
  if ! mv -- "$PARTIAL_ARTIFACT" "$artifact"; then
    rm -f -- "$manifest"
    fail "artifact_publication" "$backup_id"
  fi
  PARTIAL_ARTIFACT=""
  rmdir -- "$CREATE_LOCK"
  CREATE_LOCK=""

  duration_seconds=$(( $(date +%s) - started_at ))
  log_event info "backup.create.completed" publish succeeded "$backup_id" "$duration_seconds" "$artifact_size"
}

verify_backup() {
  require_command jq
  require_command sha256sum
  resolve_backup_directory
  backup_id="${1:-}"
  if ! verify_pair "$backup_id"; then fail "integrity_verification" "$backup_id"; fi
  artifact_size="$(stat -c '%s' "$(artifact_path "$backup_id")")"
  log_event info "backup.verify.completed" integrity succeeded "$backup_id" "" "$artifact_size"
}

deep_verify_backup() {
  require_command age
  require_command pg_restore
  require_command jq
  require_command sha256sum
  resolve_backup_directory
  backup_id="${1:-}"
  if ! verify_pair "$backup_id"; then fail "integrity_verification" "$backup_id"; fi
  require_identity_file "$backup_id"
  if ! age --decrypt --identity "$IDENTITY_FILE" "$(artifact_path "$backup_id")" 2>/dev/null \
    | pg_restore --list >/dev/null 2>&1; then
    fail "archive_verification" "$backup_id"
  fi
  log_event info "backup.deep_verify.completed" archive succeeded "$backup_id"
}

assert_empty_restore_target() {
  relation_count="$(psql --dbname "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 2>/dev/null -c \
    "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p','v','m','S','f') and n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast';")" \
    || fail "restore_target_connection" "$1"
  case "$relation_count" in (*[!0-9]*|'') fail "restore_target_inspection" "$1" ;; esac
  [ "$relation_count" = "0" ] || fail "restore_target_not_empty" "$1"
}

validate_restored_database() {
  backup_id="$1"
  migration_timestamp="$(psql --dbname "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 2>/dev/null \
    -c 'select coalesce(max(created_at), 0) from drizzle.__drizzle_migrations')" \
    || fail "post_restore_migration_state" "$backup_id"
  case "$migration_timestamp" in (*[!0-9]*|'') fail "post_restore_migration_state" "$backup_id" ;; esac
  [ "$migration_timestamp" -ge "$REQUIRED_MIGRATION_TIMESTAMP" ] \
    || fail "post_restore_required_migration" "$backup_id"

  critical_tables_present="$(psql --dbname "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 2>/dev/null -c \
    "select to_regclass('public.inquiries') is not null and to_regclass('public.conversation_messages') is not null and to_regclass('public.staff_accounts') is not null;")" \
    || fail "post_restore_schema" "$backup_id"
  [ "$critical_tables_present" = "t" ] || fail "post_restore_schema" "$backup_id"
}

restore_backup() {
  require_command age
  require_command pg_restore
  require_command psql
  require_command jq
  require_command sha256sum
  resolve_backup_directory
  require_database_url
  backup_id="${1:-}"
  [ "${YOLPOL_RESTORE_CONFIRMATION:-}" = "$RESTORE_CONFIRMATION" ] \
    || fail "restore_confirmation" "$backup_id"
  if ! verify_pair "$backup_id"; then fail "integrity_verification" "$backup_id"; fi
  require_identity_file "$backup_id"

  log_event info "backup.restore.started" preflight started "$backup_id"
  if ! age --decrypt --identity "$IDENTITY_FILE" "$(artifact_path "$backup_id")" 2>/dev/null \
    | pg_restore --list >/dev/null 2>&1; then
    fail "archive_verification" "$backup_id"
  fi
  assert_empty_restore_target "$backup_id"

  started_at="$(date +%s)"
  if ! age --decrypt --identity "$IDENTITY_FILE" "$(artifact_path "$backup_id")" 2>/dev/null \
    | pg_restore --exit-on-error --no-owner --no-privileges --single-transaction \
      --dbname "$DATABASE_URL" >/dev/null 2>&1; then
    fail "database_restore" "$backup_id"
  fi
  validate_restored_database "$backup_id"
  duration_seconds=$(( $(date +%s) - started_at ))
  log_event info "backup.restore.completed" post_restore_validation succeeded "$backup_id" "$duration_seconds"
}

prune_backups() {
  require_command jq
  require_command sha256sum
  resolve_backup_directory
  environment="${YOLPOL_DEPLOYMENT_ENVIRONMENT:-}"
  validate_environment "$environment" || fail "deployment_environment_configuration"
  retention_count="${YOLPOL_BACKUP_RETENTION_COUNT:-14}"
  case "$retention_count" in (*[!0-9]*|'') fail "retention_count_configuration" ;; esac
  [ "$retention_count" -ge 1 ] && [ "$retention_count" -le 3650 ] \
    || fail "retention_count_configuration"
  mode="${YOLPOL_BACKUP_RETENTION_MODE:-dry-run}"
  case "$mode" in
    dry-run) ;;
    delete)
      [ "${YOLPOL_BACKUP_RETENTION_CONFIRMATION:-}" = "$RETENTION_CONFIRMATION" ] \
        || fail "retention_confirmation"
      ;;
    *) fail "retention_mode_configuration" ;;
  esac

  RETENTION_LIST="$(mktemp)"
  for manifest in "$BACKUP_DIRECTORY"/yolpol-*.manifest.json; do
    [ -e "$manifest" ] || continue
    [ -f "$manifest" ] && [ ! -L "$manifest" ] || continue
    filename="$(basename "$manifest")"
    backup_id="${filename%.manifest.json}"
    validate_backup_id "$backup_id" || continue
    [ "$(environment_from_backup_id "$backup_id")" = "$environment" ] || continue
    if verify_pair "$backup_id"; then printf '%s\n' "$backup_id" >> "$RETENTION_LIST"; fi
  done

  sort -r "$RETENTION_LIST" | awk -v keep="$retention_count" 'NR > keep' | while IFS= read -r backup_id; do
    [ -n "$backup_id" ] || continue
    if ! verify_pair "$backup_id"; then fail "retention_reverification" "$backup_id"; fi
    if [ "$mode" = "dry-run" ]; then
      log_event info "backup.retention.candidate" retention dry_run "$backup_id"
      continue
    fi
    rm -- "$(artifact_path "$backup_id")"
    rm -- "$(manifest_path "$backup_id")"
    log_event info "backup.retention.deleted" retention deleted "$backup_id"
  done
  log_event info "backup.retention.completed" retention succeeded
}

usage() {
  cat <<'EOF'
Usage: yolpol-backup-restore <command> [backup-id]

Commands:
  create                    Create an encrypted backup and adjacent manifest.
  verify <backup-id>        Verify manifest pairing, encrypted size, and SHA-256.
  deep-verify <backup-id>   Verify integrity, decryption, and custom archive structure.
  restore <backup-id>       Restore only to a confirmed, empty destination database.
  prune                     Dry-run retention unless explicit deletion is configured.
  help                      Show this help.
EOF
}

case "${1:-help}" in
  create) [ "$#" -eq 1 ] || fail "arguments"; create_backup ;;
  verify) [ "$#" -eq 2 ] || fail "arguments"; verify_backup "$2" ;;
  deep-verify) [ "$#" -eq 2 ] || fail "arguments"; deep_verify_backup "$2" ;;
  restore) [ "$#" -eq 2 ] || fail "arguments"; restore_backup "$2" ;;
  prune) [ "$#" -eq 1 ] || fail "arguments"; prune_backups ;;
  help|-h|--help) usage ;;
  *) fail "arguments" ;;
esac
