# This file is mounted only by the guarded, tmpfs-backed validation overlay.
# It runs after disposable roles are created and before the final server starts.
if [ "${PGDATA:-}" != /var/lib/postgresql/data ] ||
  [ ! -f /disposable-task0082 ] ||
  [ "$(cat /disposable-task0082)" != task0082-tmpfs ] ||
  [ ! -f "$PGDATA/pg_hba.conf" ]; then
  echo 'Disposable discovery authentication configuration refused' >&2
  return 1
fi

umask 077
discovery_hba_temp="$(mktemp "$PGDATA/pg_hba.discovery.XXXXXX")"
cat > "$discovery_hba_temp" <<'HBA'
# First match wins. Confine the Staff reader for both socket and TCP clients.
local yolpol_acquisition discovery_staff_reader scram-sha-256
local all discovery_staff_reader reject
host yolpol_acquisition discovery_staff_reader all scram-sha-256
host all discovery_staff_reader all reject
HBA
if head -n 5 "$PGDATA/pg_hba.conf" | cmp -s - "$discovery_hba_temp"; then
  rm "$discovery_hba_temp"
  return 0
fi
cat "$PGDATA/pg_hba.conf" >> "$discovery_hba_temp"
mv "$discovery_hba_temp" "$PGDATA/pg_hba.conf"
