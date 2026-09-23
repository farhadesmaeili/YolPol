#!/bin/sh

set -eu

/usr/bin/install -o root -g root -m 0440 /usr/local/share/yolpol-deploy.sudoers /etc/sudoers.d/yolpol-deploy
/usr/bin/install -o root -g root -m 0440 /usr/local/share/yolpol-deployment-agent.sudoers /etc/sudoers.d/yolpol-deployment-agent

WRAPPER=/opt/yolpol/bin/yolpol-deploy
INTERNAL=/opt/yolpol/bin/yolpol-deploy-internal
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

for action in validate status health pull-approved-images deploy-database migrate deploy-app deploy-workers \
  staff-provision staff-bootstrap-super-admin telegram-webhook-set telegram-webhook-info backup-create \
  production-validate production-status production-health production-pull-approved-images \
  production-deploy-database production-migrate production-deploy-app production-deploy-workers \
  production-staff-provision production-staff-bootstrap-super-admin \
  production-telegram-webhook-set production-telegram-webhook-info production-backup-create \
  ingress-validate ingress-status ingress-health ingress-health-production; do
  expect_accepted_grammar "$action"
done
expect_accepted_grammar backup-verify yolpol-staging-20260913T000000Z-abcdef0
expect_accepted_grammar production-backup-verify yolpol-production-20260913T000000Z-abcdef0
expect_accepted_grammar reconcile-staging-pre-mutation 123456789

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
expect_rejected production-status extra
expect_rejected deploy-edge
expect_rejected production-deploy-edge
expect_rejected ingress-deploy
expect_rejected ingress-status extra
expect_rejected ingress-status --project-directory /tmp/evil
expect_rejected ingress-health --network attacker
expect_rejected deploy-app production
expect_rejected production-deploy-app staging
expect_rejected migrate --environment production
expect_rejected production-migrate --environment staging
expect_rejected production-backup-verify
expect_rejected production-backup-verify yolpol-staging-20260913T000000Z-abcdef0
expect_rejected backup-verify yolpol-production-20260913T000000Z-abcdef0
expect_rejected production-backup-verify '../../root/.ssh/authorized_keys'
expect_rejected production-backup-verify 'yolpol-production-20260913T000000Z-$(id)'
expect_rejected production-backup-verify "yolpol-production-20260913T000000Z-abcdef0$(printf '\n')evil"
expect_rejected reconcile-staging-pre-mutation
expect_rejected reconcile-staging-pre-mutation ''
expect_rejected reconcile-staging-pre-mutation 0
expect_rejected reconcile-staging-pre-mutation +1
expect_rejected reconcile-staging-pre-mutation -1
expect_rejected reconcile-staging-pre-mutation 01
expect_rejected reconcile-staging-pre-mutation '1/../../root'
expect_rejected reconcile-staging-pre-mutation '1 2'
expect_rejected reconcile-staging-pre-mutation 1 extra
newline_deployment_id=$(printf '1\n2')
expect_rejected reconcile-staging-pre-mutation "$newline_deployment_id"
expect_rejected reconcile-staging-pre-mutation 111111111111111111111111111111111

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

mkdir -p /opt/yolpol/runtime/tmp
chmod 0700 /opt/yolpol/runtime /opt/yolpol/runtime/tmp
: > /opt/yolpol/runtime/deployment.lock
chmod 0600 /opt/yolpol/runtime/deployment.lock
exec 9>>/opt/yolpol/runtime/deployment.lock
/usr/bin/flock -x 9
YOLPOL_INTERNAL_LOCK_FD=9 "$INTERNAL" public-smoke-staging \
  || fail_test 'CRLF noindex response header was rejected'
set +e
invalid_header_output=$(YOLPOL_TEST_CURL_HEADER='x-robots-tag: noindex, nofollow' \
  YOLPOL_INTERNAL_LOCK_FD=9 "$INTERNAL" public-smoke-staging 2>&1)
invalid_header_status=$?
set -e
[ "$invalid_header_status" -eq 1 ] || fail_test 'invalid noindex response header was accepted'
printf '%s' "$invalid_header_output" | grep -Fq 'Staging noindex header missing' \
  || fail_test 'invalid noindex response header failed without the closed diagnostic'
exec 9>&-

set +e
root_only_output=$(/usr/sbin/runuser -u yolpol-operator -- /usr/bin/sudo -n \
  "$WRAPPER" reconcile-staging-pre-mutation 123456789 2>&1)
root_only_status=$?
set -e
[ "$root_only_status" -ne 0 ] \
  || fail_test 'operator unexpectedly reconciled a ledger record'

set +e
agent_recovery_output=$(/usr/sbin/runuser -u yolpol-deployment-agent -- /usr/bin/sudo -n -l -- \
  "$WRAPPER" reconcile-staging-pre-mutation 123456789 2>&1)
agent_recovery_status=$?
set -e
[ "$agent_recovery_status" -ne 0 ] || fail_test 'deployment agent unexpectedly reconciled a ledger record'

/usr/bin/python3 -I -B /usr/local/bin/test-bootstrap-linux.py \
  || fail_test 'server bootstrap Linux validation'

printf '%s\n' 'deployment disposable Linux adversarial validation passed'
