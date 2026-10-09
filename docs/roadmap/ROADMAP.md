# YolPol Roadmap

## Customer Acquisition — Task 0082

NOW: implemented and disposable-runtime-validated local, synthetic-only foundation: isolated
n8n, independent acquisition persistence/migrations, authenticated internal API,
company/contact deduplication, immutable provenance, deterministic qualification and
suppression. Status and executed verification are recorded in
[Task 0082](../tasks/0082-customer-acquisition-automation-foundation.md).

The 2026-10-09 focused audit corrections are verified: post-normalization/derived-key
Unicode bounds and terse PostgreSQL error-detail logging. Task 0082 records 56 focused
tests, 14 PostgreSQL tests, both database log-privacy probes and the 2,581-test full
suite. Neither correction activates persistent or Production resources.

NEXT: approve one Company Discovery source with terms/rate limits/privacy/retention,
then design Contact Discovery, Email Verification, provider-neutral AI qualification
and Telegram human approval through existing application boundaries.

LATER: sending, SMTP/IMAP, follow-ups, replies, campaigns, CRM and VPS/Production
activation. Broad scraping, LinkedIn scraping and shared Production database access
are not authorized by this foundation. Release-state documentation reconciliation
for the separately reported v0.2.9 deployment remains a separate item; historical
operational evidence below is unchanged.

## Privacy and measurement

The localized Privacy Policy, footer legal link, Inquiry-consent link, metadata, sitemap integration, and explicit optional-analytics preferences are implemented. GA4 is a Production-only runtime feature isolated to a public root document that is separate from Staff: analytics storage defaults to denied, the external Google script is not loaded before consent, Staging remains disabled, explicit App Router page views omit query strings, and successful new Inquiries emit only a minimal `generate_lead` event without Inquiry PII. Before Production activation, an operator must verify that the Google Web Stream's Enhanced Measurement option **Page changes based on browser history events** is disabled; the repository does not configure that external setting. Google Search Console remains a separate search-performance concern.

## Customer Inquiry presentation

Localized Inquiry submission, Product preselection, consent linkage, server validation, trusted Product resolution, and transactional PostgreSQL persistence are implemented. Distributed abuse controls and durable notification delivery remain deferred.

The PostgreSQL persistence foundation is active through the narrow Inquiry route. Cross-client idempotency, distributed abuse prevention, durable notification delivery, and operational retention remain deferred.

## Export Logistics foundation

The multilingual pallet-only planning page, verified Product packaging boundary, capacity assessment and buyer-arranged operational workflow are implemented. Freight pricing, carrier/customs integrations, axle calculations, partial pallets, saved plans and inquiry submission remain deferred.

## Operational deployment automation

The Production repository foundation and shared-ingress migration are complete. The repository-managed Phase B bootstrap contract, including Ubuntu 24.04 LTS/noble support, has been successfully applied and converged on the current VPS; `yolpol-bootstrap check` reports that the foundation is ready. Phase C1 is implemented and activated: the deployment-agent timer is enabled and active, GitHub-side activation is complete for the verified main-only Production promotion path, Staging deploys automatically, and Production deploys only after explicit approval. Release `v0.2.7` at Git SHA `ebf1988e1b7e6fbc4615fd946652f8147e34af6f` is the current verified Production release and completed as `deployed-not-publicly-activated`. The `v0.2.3` monitoring activation milestone verified 12/12 healthy Prometheus targets and four successful Blackbox probes; the hardened `prometheus-admin-proxy` architecture released in `v0.2.4` was subsequently deployed and accepted on the live VPS with localhost access through `127.0.0.1:9090`. Tasks 0069, 0071-0074, 0077, and 0078 established the fail-closed Phase C2 evidence, Windows SFTP, durable receipt, authenticated provenance, bounded readback, 1 GiB eligibility, and recurring-cadence contracts. The final helper and recurring LocalSystem task are installed and accepted, and the VPS uses the canonical configured `windows-sftp-v1` state. The historical adapter-only backup remains immutable and unbound. Separately, the authenticated `v0.2.7` controller transaction created a fresh backup, published canonical evidence bound to Production Deployment `6872397689` and the exact migration fingerprints, accepted off-server durability before migration, completed `0024_phase_c2_live_acceptance`, and finished successfully. Final public DNS/Cloudflare cutover, independent external monitoring, and disposable rebuild/restore/disaster-recovery proof remain separate work.

### Phase A - Production Deployment Foundation

- Add repository-managed Production Compose and configuration.
- Isolate Production completely from Staging.
- Give Production independent databases, volumes, backend/ingress networks, backups, credentials, Telegram bot, and runtime configuration.
- Deploy only immutable release digest references.
- Preserve production-safe restricted operations.

### Phase B - Server Bootstrap Automation

Implemented in Task 0065 as one root-only, fail-closed workflow and expanded in Task 0067 to exactly Debian 12/bookworm and Ubuntu 24.04/noble on `x86_64` (`amd64`). The workflow prepares or validates a clean/disposable host, installs only reviewed fixed contracts, consumes runtime/secrets through closed schemas, preserves independent release authorities, and starts no YOLPOL Compose workloads. Installing Docker on a clean host may enable the Docker daemon as a prerequisite.

The implemented repository contract covers:

- operating-system prerequisites
- Docker Engine and Compose installation and validation
- operator identity
- filesystem hierarchy
- permissions and ACL contract
- restricted deployment wrapper
- sudoers configuration
- audit and logrotate setup
- deployment directories
- Monitoring foundation
- runtime configuration bootstrap
- secure secret consumption
- release installation
- validation

Secrets must never be embedded in Git or generated insecurely. Bootstrap automation must consume them through an explicitly secure mechanism.

### Phase C - Release Deployment Automation

Task 0066 Phase C1 implements the repository path:

```text
GitHub Release
-> authenticated manifest verification
-> automatic Staging deployment
-> health, readiness, and smoke validation
-> Production approval gate
-> exact immutable Production deployment
-> health verification
-> deployment record
```

Normal releases use no interactive SSH. An approved GitHub-hosted Environment job binds exact intent bytes to GitHub OIDC and an explicit Deployment; a repository-scoped read-only GitHub App agent discovers it, and the root controller applies the existing one-lock host contracts. Staging deployment and Production promotion are covered. The repository controller requires a fresh Production backup, local/deep verification, fixed Windows SFTP upload, bounded canonical receipt plus detached-signature validation, pinned RSA-PSS/SHA-256 verification, and exact final durable-store readback before canonical evidence for every changed fingerprint. The committed repository path still ships fail-closed and unconfigured, while the separately managed live VPS uses the accepted configured adapter and recurring LocalSystem cadence. Production Deployment `6872397689` exercised this path end to end for `v0.2.7`: a new controller-created backup advanced the ledger through accepted off-server durability before migration `0024_phase_c2_live_acceptance` completed. Future changed fingerprints still require their own fresh deployment-bound evidence and fail closed when it is absent or invalid.

### Phase D - Rebuild and Disaster-Recovery Validation

- Prove that a fresh disposable server can be rebuilt from the documented automation.
- Verify backup and recovery requirements.
- Verify that ordinary deployment does not depend on undocumented host state.

The final target operating model treats servers as disposable and rebuildable. SSH should eventually be reserved mainly for bootstrap recovery, incidents, debugging, and exceptional recovery operations. Routine deployment should happen through controlled automation rather than manual shell commands.

## 1. Project Foundation

- Multilingual routing and RTL/LTR document support
- Localized home-page proof
- SEO primitives and quality checks
- Architecture and decision records

## 2. Product Catalog Domain

- [x] Typed product and category models
- [x] Locale-separated static content boundary
- [x] Read-oriented repository interface and static implementation
- [x] Catalog use cases and business-rule tests
- [x] Framework-independent product presenter and view models
- [x] Static dataset integrity and isolated repository results
- [x] Enter the nine verified Product records through the approved content process

## 3. Catalog Presentation

- [x] Localized product listing and detail routes
- [x] Empty, loading, and localized not-found states
- [x] Product metadata, structured data, and sitemap integration
- Separate authorized administrative listing policy if required
- [ ] Responsive filtering and pagination when the verified catalog requires them
- [x] Publish verified four-locale Product content and tracked images
- [x] Add localized category landing pages for current published categories

## 4. Company and Conversion Pages

- [x] Shared multilingual header, navigation, locale switcher, and footer
- [x] Factual localized About and Contact pages
- [x] Quotation preparation and localized Privacy Policy pages
- [x] Framework-independent Customer Inquiry foundation without runtime activation
- Validated public inquiry workflow after privacy and integration readiness

## 5. Launch Readiness

- [x] Confirm production domain as `https://yolpol.com`
- [x] Add the isolated Production deployment contract and deploy the healthy `v0.2.2` Production runtime
- [x] Implement Task 0064 and complete the manual shared-host-ingress and Staging Monitoring migration on the current VPS
- [x] Apply and converge the repository-managed server bootstrap contract, including the Ubuntu 24.04/noble compatibility fix
- [x] Activate authenticated automatic Staging deployment and explicit approved Production promotion
- [x] Bootstrap and deploy the real Production runtime through `v0.2.2`
- [x] Implement and adversarially test the provider-neutral Phase C2 repository contract
- [x] Implement and synthetically test fixed Windows SFTP transport and destination readback
- [x] Implement and synthetically/static test the Windows durable-copy/volume-flush receipt and final durable-store readback contract
- [x] Implement and adversarially test fixed authenticated Windows receipt provenance with detached RSA-PSS signatures
- [x] Contain every VPS-side SFTP readback with an exact per-object `RLIMIT_FSIZE` and pre-stage temporary-capacity admission
- [x] Disable core dumps for every bounded SFTP readback child with fixed inherited `RLIMIT_CORE=(0,0)` containment
- [x] Bound eligible Phase C2 encrypted artifacts to a fixed 1 GiB maximum before remote durability work
- [x] Run and accept the separately approved one-shot/demand-run 1 GiB LocalSystem durable-copy/flush/receipt benchmark inside the fixed 180-second deadline
- [x] Implement and test the repository-managed bounded Windows cadence definition and completed-history fast path
- [x] Separately activate and accept the recurring Windows Scheduled Task cadence on the live host
- [x] Activate the canonical `windows-sftp-v1` Phase C2 configuration on the VPS
- [x] Transfer and accept a real Production encrypted backup through signed receipt verification and exact durable readback at adapter level
- [x] Publish controller-created deployment-bound canonical evidence for a fresh backup ID and accept the changed-migration-fingerprint Production gate in the real `v0.2.7` Production transaction
- [x] Implement and synthetically validate the isolated Production Monitoring repository contract
- [x] Record the reviewed Production Monitoring activation milestone at `v0.2.3`
- [x] Verify the released Prometheus loopback proxy contract on the live host
- [ ] Add independent off-host monitoring, including public DNS/TLS coverage after cutover
- [ ] Validate disposable rebuild/disaster recovery
- [ ] Complete a separately verified and approved public DNS/Cloudflare cutover
- Content review in all locales
- Accessibility, performance, SEO, and end-to-end validation

Public Product persistence, public authentication, payments, a CMS and a catalog admin dashboard remain outside the current phase. Customer acquisition is limited to the Task 0082 local synthetic foundation above; real outreach and deployment remain deferred. The active Inquiry PostgreSQL flow and deployed Production runtime do not by themselves establish that public Production cutover is complete.
