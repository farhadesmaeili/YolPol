#!/bin/sh

set -eu

WRAPPER=/opt/yolpol/bin/yolpol-deploy
MARKER=/tmp/yolpol-environment-injection

fail_test() {
  printf 'deployment disposable test failed: %s\n' "$1" >&2
  exit 1
}

run_unprivileged() {
  /usr/sbin/runuser -u yolpol-operator -- "$WRAPPER" "$@"
}

expect_rejected() {
  set +e
  output=$(run_unprivileged "$@" 2>&1)
  status=$?
  set -e
  [ "$status" -eq 64 ] || fail_test "malicious argv was not rejected: $* ($status: $output)"
}

expect_accepted_grammar() {
  set +e
  output=$(run_unprivileged "$@" 2>&1)
  status=$?
  set -e
  [ "$status" -eq 1 ] || fail_test "allowed argv did not cross the parser: $* ($status: $output)"
  printf '%s' "$output" | grep -Fq 'must run as root through the approved sudo rule' \
    || fail_test "allowed argv failed before the root boundary: $*"
}

/usr/sbin/visudo -cf /etc/sudoers.d/yolpol-deploy >/dev/null \
  || fail_test 'sudoers syntax validation'

for action in validate status health pull-approved-images deploy-database migrate deploy-app deploy-workers deploy-edge backup-create; do
  expect_accepted_grammar "$action"
done
expect_accepted_grammar backup-verify yolpol-staging-20260913T000000Z-abcdef0

expect_rejected
expect_rejected unknown
expect_rejected status extra
expect_rejected backup-verify
expect_rejected backup-verify ''
expect_rejected backup-verify '../../root/.ssh/authorized_keys'
expect_rejected backup-verify 'yolpol-staging-20260913T000000Z-abcdef0;sh'
expect_rejected backup-verify 'yolpol-staging-20260913T000000Z-$(id)'
expect_rejected backup-verify 'yolpol-staging-20260913T000000Z-abcdef0 extra'
expect_rejected backup-verify "yolpol-staging-20260913T000000Z-abcdef0$(printf '\r')"
expect_rejected backup-verify "yolpol-staging-20260913T000000Z-abcdef0$(printf '\n')evil"
expect_rejected backup-verify "yolpol-staging-20260913T000000Z-abcdef0$(printf '\t')evil"
expect_rejected backup-verify 'yolpol-staging-20260913T000000Z-abcdef0-é'
expect_rejected backup-verify "yolpol-staging-20260913T000000Z-$(printf '%065d' 0)"

printf 'touch %s\n' "$MARKER" > /tmp/poison
chmod 0644 /tmp/poison
set +e
output=$(/usr/sbin/runuser -u yolpol-operator -- /usr/bin/env \
  PATH=/tmp HOME=/tmp TMPDIR=/tmp DOCKER_HOST=tcp://attacker COMPOSE_FILE=/tmp/evil.yml \
  ENV=/tmp/poison BASH_ENV=/tmp/poison LC_ALL=C "$WRAPPER" validate 2>&1)
status=$?
set -e
[ "$status" -eq 1 ] || fail_test 'poisoned environment changed parser behavior'
[ ! -e "$MARKER" ] || fail_test 'shell startup environment executed attacker content'
printf '%s' "$output" | grep -Fq 'must run as root through the approved sudo rule' \
  || fail_test 'poisoned environment redirected a trusted executable'

sed '/^staging_compose()/,$d' "$WRAPPER" > /tmp/wrapper-trust-helpers
mkdir /tmp/trusted-parent
chmod 0755 /tmp/trusted-parent
/bin/sh -c '. /tmp/wrapper-trust-helpers; require_directory /tmp/trusted-parent 0 0 755' \
  || fail_test 'safe root-owned directory was rejected'
chmod 0775 /tmp/trusted-parent
/bin/sh -c '. /tmp/wrapper-trust-helpers; require_directory /tmp/trusted-parent 0 0 755' >/dev/null 2>&1 \
  && fail_test 'group-writable trusted directory was accepted'
chmod 0755 /tmp/trusted-parent
chown yolpol-operator:yolpol-operator /tmp/trusted-parent
/bin/sh -c '. /tmp/wrapper-trust-helpers; require_directory /tmp/trusted-parent 0 0 755' >/dev/null 2>&1 \
  && fail_test 'operator-owned trusted directory was accepted'
chown root:root /tmp/trusted-parent
setfacl -m u:yolpol-operator:rwx /tmp/trusted-parent
/bin/sh -c '. /tmp/wrapper-trust-helpers; require_directory /tmp/trusted-parent 0 0 755' >/dev/null 2>&1 \
  && fail_test 'operator ACL on trusted directory was accepted'
setfacl -b /tmp/trusted-parent
setfacl -m d:u:yolpol-operator:rwx /tmp/trusted-parent
/bin/sh -c '. /tmp/wrapper-trust-helpers; require_directory /tmp/trusted-parent 0 0 755' >/dev/null 2>&1 \
  && fail_test 'default ACL on trusted directory was accepted'
setfacl -k /tmp/trusted-parent
ln -s /tmp/trusted-parent /tmp/untrusted-link
/bin/sh -c '. /tmp/wrapper-trust-helpers; require_directory /tmp/untrusted-link 0 0 755' >/dev/null 2>&1 \
  && fail_test 'symlinked trusted directory was accepted'

sed '/^check_backup_capacity()/,$d' "$WRAPPER" > /tmp/wrapper-audit-helpers
/bin/sh -c '
  . /tmp/wrapper-audit-helpers
  AUDIT_LOG=/tmp/deployment-audit-test.log
  ACTOR=unknown
  ACTION=backup-verify
  BACKUP_AUDIT_ID=yolpol-staging-20260913T000000Z-abcdef0
  read_revision() { printf "%s" aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; }
  : > "$AUDIT_LOG"
  chmod 0600 "$AUDIT_LOG"
  audit denied 64
  grep -Eq "^timestamp=[0-9TZ:-]+ actor=unknown action=backup-verify revision=a{40} backup_id=yolpol-staging-20260913T000000Z-abcdef0 result=denied exit_code=64$" "$AUDIT_LOG"
' || fail_test 'safe audit record behavior'

set +e
sudo_output=$(/usr/sbin/runuser -u yolpol-operator -- /usr/bin/sudo -n "$WRAPPER" definitely-invalid 2>&1)
sudo_status=$?
set -e
[ "$sudo_status" -ne 0 ] || fail_test 'invalid arbitrary sudo argument unexpectedly succeeded'
printf '%s' "$sudo_output" | grep -Fq 'not allowed to execute' \
  && fail_test 'sudoers did not match arbitrary wrapper arguments as documented'

printf '%s\n' 'deployment disposable Linux adversarial validation passed'
