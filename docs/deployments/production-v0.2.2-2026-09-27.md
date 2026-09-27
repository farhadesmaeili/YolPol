# Production Deployment Record: v0.2.2

## Deployment result

On 2026-09-27, YOLPOL release `v0.2.2` completed the authenticated release path from Staging to Production. The Production runtime is deployed and healthy. This record does not claim that the final public DNS/Cloudflare cutover is complete.

## Release identity

- Version: `0.2.2`
- Tag: `v0.2.2`
- Git SHA: `48a566142bd0259c596314f6a01a92cc66d868ce`
- Release Publication workflow: successful

The active Staging and Production authorities both report:

```text
version=0.2.2
tag=v0.2.2
gitSha=48a566142bd0259c596314f6a01a92cc66d868ce
```

## Authenticated promotion

The release deployed automatically to Staging and was then promoted to Production through the authenticated GitHub/control-plane path after explicit Production approval. The successful Production workflow was dispatched from `main`, used the release SHA above, and completed successfully.

Canonical Production trust is main-only:

```text
workflowRef=farhadesmaeili/YolPol/.github/workflows/promote-production.yml@refs/heads/main
jobWorkflowRef=farhadesmaeili/YolPol/.github/workflows/deploy-release.yml@refs/heads/main
eventName=workflow_dispatch
ref=refs/heads/main
```

The GitHub Production Environment was configured to allow this canonical main-based promotion path. No broader workflow or branch trust is recorded.

## Host and agent readiness

The installed readiness gates report:

```text
yolpol-bootstrap check: foundation is ready
yolpol-bootstrap check-production: production is ready
```

The deployment-agent timer is active and enabled, and its latest execution result was successful. The Production runtime, secrets, database, release authority, and application containers are provisioned and healthy.

## Post-release ancestry

PR #132, `chore: sync main into develop after v0.2.2 release`, merged successfully into `develop` as commit `a3770724ea3404f28385c6f5f39969181c6da455`. The pull request recorded zero changed files, zero additions, and zero deletions. After branch cleanup, the remote branches were `develop` and `main`.

## Cleanup and rollback retention

Temporary `v0.2.2` bootstrap artifacts were removed. The following rollback and audit material was deliberately retained:

- `/root/yolpol-bootstrap-source`
- `/root/yolpol-bootstrap-source.backup-pre-v0.2.2`
- `/root/yolpol-agent.json.pre-main-v0.2.2`
- `/opt/yolpol/releases/active`
- `/opt/yolpol/releases/staging/active`
- `/opt/yolpol/releases/production/active`
- previous release snapshots

The legacy `/opt/yolpol/releases/active` authority remains intentionally available for rollback compatibility; it is not the current Staging or Production authority.

## Remaining limitations

- Phase C2 off-server backup durability is not complete. A Production release with a changed migration fingerprint remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.
- Production Monitoring is not fully designed or activated. It still requires separately reviewed credentials, network attachments, probes, backup signals, alert routing, and policy validation.
- Disposable rebuild and full disaster-recovery proof are not complete. No automatic restore, PITR, down migration, or full off-server disaster recovery is claimed.
- The repository's last verified Cloudflare state redirected `yolpol.com` and `www.yolpol.com` to `staging.yolpol.com`. This deployment record does not claim that redirect removal or the final public DNS/Cloudflare cutover has occurred.

Production runtime deployment and public Production cutover are separate milestones. Only the runtime deployment is verified here.
