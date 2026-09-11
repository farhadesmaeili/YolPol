#!/bin/sh

set -eu

readonly TOOL=/usr/local/bin/yolpol-backup-restore
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT HUP INT TERM

fail_test() {
  printf 'backup/restore focused test failed: %s\n' "$1" >&2
  exit 1
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then fail_test "expected command failure"; fi
}

create_pair() {
  backup_id="$1"
  created_at="$2"
  directory="$3"
  plaintext="$4"
  printf '%s' "$plaintext" | age --encrypt --recipient "$RECIPIENT" --output "$directory/$backup_id.dump.age"
  size="$(stat -c '%s' "$directory/$backup_id.dump.age")"
  checksum="$(sha256sum "$directory/$backup_id.dump.age" | awk '{print $1}')"
  jq -n \
    --arg backupId "$backup_id" \
    --arg createdAt "$created_at" \
    --arg filename "$backup_id.dump.age" \
    --argjson size "$size" \
    --arg checksum "$checksum" \
    '{
      formatVersion:1,
      backupId:$backupId,
      createdAt:$createdAt,
      deploymentEnvironment:"staging",
      applicationRevision:"abcdef0",
      postgresql:{majorVersion:17,serverVersion:"17.6",clientVersion:"pg_dump (PostgreSQL) 17.6"},
      dump:{format:"custom"},
      encryption:{scheme:"age-x25519"},
      artifact:{filename:$filename,sizeBytes:$size,sha256:$checksum},
      schema:{
        latestMigrationTimestamp:1788832991886,
        requiredMigration:"0022_global_translation_settings",
        requiredMigrationTimestamp:1788832991886
      }
    }' > "$directory/$backup_id.manifest.json"
}

mkdir "$TEST_ROOT/backups" "$TEST_ROOT/keys" "$TEST_ROOT/outside"
age-keygen -o "$TEST_ROOT/keys/identity" >/dev/null 2>&1
RECIPIENT="$(age-keygen -y "$TEST_ROOT/keys/identity")"
readonly RECIPIENT

FIRST_ID=yolpol-staging-20260910T010101Z-abcdef0
create_pair "$FIRST_ID" 2026-09-10T01:01:01Z "$TEST_ROOT/backups" synthetic-one
YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" "$TOOL" verify "$FIRST_ID" >/dev/null

jq -e 'has("databaseUrl") | not' "$TEST_ROOT/backups/$FIRST_ID.manifest.json" >/dev/null \
  || fail_test "manifest exposes a database URL field"
jq -e '.. | objects | keys[]' "$TEST_ROOT/backups/$FIRST_ID.manifest.json" \
  | grep -Eiq 'password|credential|identity|secret|host|username' \
  && fail_test "manifest contains a credential-like field"

expect_failure env YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" "$TOOL" verify ../outside

cp "$TEST_ROOT/backups/$FIRST_ID.manifest.json" "$TEST_ROOT/backups/$FIRST_ID.manifest.original"
jq '.formatVersion = 2' "$TEST_ROOT/backups/$FIRST_ID.manifest.original" > "$TEST_ROOT/backups/$FIRST_ID.manifest.json"
expect_failure env YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" "$TOOL" verify "$FIRST_ID"
mv "$TEST_ROOT/backups/$FIRST_ID.manifest.original" "$TEST_ROOT/backups/$FIRST_ID.manifest.json"

printf 'corruption' >> "$TEST_ROOT/backups/$FIRST_ID.dump.age"
expect_failure env YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" "$TOOL" verify "$FIRST_ID"
rm "$TEST_ROOT/backups/$FIRST_ID.dump.age"
expect_failure env YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" "$TOOL" verify "$FIRST_ID"
create_pair "$FIRST_ID" 2026-09-10T01:01:01Z "$TEST_ROOT/backups" synthetic-one

expect_failure env \
  YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" \
  YOLPOL_BACKUP_AGE_IDENTITY_FILE="$TEST_ROOT/keys/identity" \
  DATABASE_URL=postgresql://synthetic:synthetic@invalid/synthetic \
  "$TOOL" restore "$FIRST_ID"

SECOND_ID=yolpol-staging-20260910T020202Z-abcdef0
THIRD_ID=yolpol-staging-20260910T030303Z-abcdef0
create_pair "$SECOND_ID" 2026-09-10T02:02:02Z "$TEST_ROOT/backups" synthetic-two
create_pair "$THIRD_ID" 2026-09-10T03:03:03Z "$TEST_ROOT/backups" synthetic-three
ln -s "$TEST_ROOT/outside/protected.dump.age" "$TEST_ROOT/backups/yolpol-staging-20260909T000000Z-abcdef0.dump.age"
ln -s "$TEST_ROOT/outside/protected.manifest.json" "$TEST_ROOT/backups/yolpol-staging-20260909T000000Z-abcdef0.manifest.json"
printf 'protected\n' > "$TEST_ROOT/outside/protected.dump.age"
printf 'protected\n' > "$TEST_ROOT/outside/protected.manifest.json"

YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" \
YOLPOL_DEPLOYMENT_ENVIRONMENT=staging \
YOLPOL_BACKUP_RETENTION_COUNT=2 \
  "$TOOL" prune >/dev/null
[ -f "$TEST_ROOT/backups/$FIRST_ID.dump.age" ] || fail_test "dry-run deleted an artifact"

YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" \
YOLPOL_DEPLOYMENT_ENVIRONMENT=staging \
YOLPOL_BACKUP_RETENTION_COUNT=2 \
YOLPOL_BACKUP_RETENTION_MODE=delete \
YOLPOL_BACKUP_RETENTION_CONFIRMATION=DELETE_OLD_VERIFIED_BACKUPS \
  "$TOOL" prune >/dev/null
[ ! -e "$TEST_ROOT/backups/$FIRST_ID.dump.age" ] || fail_test "old verified artifact was not deleted"
[ -f "$TEST_ROOT/backups/$SECOND_ID.dump.age" ] || fail_test "retained artifact was deleted"
[ -f "$TEST_ROOT/backups/$THIRD_ID.dump.age" ] || fail_test "newest artifact was deleted"
[ "$(cat "$TEST_ROOT/outside/protected.dump.age")" = protected ] || fail_test "retention followed an artifact symlink"
[ "$(cat "$TEST_ROOT/outside/protected.manifest.json")" = protected ] || fail_test "retention followed a manifest symlink"

expect_failure env \
  YOLPOL_BACKUP_DIRECTORY="$TEST_ROOT/backups" \
  YOLPOL_DEPLOYMENT_ENVIRONMENT=staging \
  YOLPOL_BACKUP_RETENTION_COUNT=0 \
  YOLPOL_BACKUP_RETENTION_MODE=delete \
  YOLPOL_BACKUP_RETENTION_CONFIRMATION=DELETE_OLD_VERIFIED_BACKUPS \
  "$TOOL" prune

printf 'backup/restore focused tests passed\n'
