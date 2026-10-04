# YolPol Roadmap

## Privacy and measurement

The localized Privacy Policy, footer legal link, Inquiry-consent link, metadata, sitemap integration, and explicit optional-analytics preferences are implemented. GA4 is a Production-only runtime feature isolated to a public root document that is separate from Staff: analytics storage defaults to denied, the external Google script is not loaded before consent, Staging remains disabled, explicit App Router page views omit query strings, and successful new Inquiries emit only a minimal `generate_lead` event without Inquiry PII. Before Production activation, an operator must verify that the Google Web Stream's Enhanced Measurement option **Page changes based on browser history events** is disabled; the repository does not configure that external setting. Google Search Console remains a separate search-performance concern.

## Customer Inquiry presentation

Localized Inquiry submission, Product preselection, consent linkage, server validation, trusted Product resolution, and transactional PostgreSQL persistence are implemented. Distributed abuse controls and durable notification delivery remain deferred.

The PostgreSQL persistence foundation is active through the narrow Inquiry route. Cross-client idempotency, distributed abuse prevention, durable notification delivery, and operational retention remain deferred.

## Export Logistics foundation

The multilingual pallet-only planning page, verified Product packaging boundary, capacity assessment and buyer-arranged operational workflow are implemented. Freight pricing, carrier/customs integrations, axle calculations, partial pallets, saved plans and inquiry submission remain deferred.

## Operational deployment automation

The Production repository foundation and shared-ingress migration are complete. The repository-managed Phase B bootstrap contract, including Ubuntu 24.04 LTS/noble support, has been successfully applied and converged on the current VPS; `yolpol-bootstrap check` reports that the foundation is ready. Phase C1 is implemented and activated: the deployment-agent timer is enabled and active, GitHub-side activation is complete for the verified main-only Production promotion path, Staging deploys automatically, and Production deploys only after explicit approval. The repository is version `0.2.6`; local history does not prove which release is currently deployed. The `v0.2.3` monitoring activation milestone verified the isolated ten-service topology with 12/12 healthy targets and four successful Blackbox probes. The Prometheus loopback proxy fix is included in local release history from `v0.2.4` onward, but its live-host rollout remains unverified here. Task 0069 implements the provider-neutral Phase C2 durability/evidence contract, Task 0071 adds fixed Windows OpenSSH SFTP transport, Task 0072 adds the Windows durable-copy/volume-flush receipt helper and exact final durable-store readback, Task 0073 adds fixed CNG RSA-3072 receipt signing plus pinned VPS RSA-PSS verification, Task 0074 adds per-object kernel readback containment plus local temporary-capacity admission, Task 0077 fixes the maximum eligible encrypted artifact at 1 GiB, and Task 0078 adds the repository-managed maximum nominal trigger opportunity gap of 30 seconds plus a metadata-only authenticated completed-history path and one-pending-pair bound. The separately approved pre-Task-0078-helper 1 GiB LocalSystem benchmark passed with receipt/signature publication at 101.929 seconds; final recurring activation still requires a fresh benchmark against the final installed Task 0078 helper bytes after proving a zero-pending backlog. The permanent Scheduled Task remains disabled with no automatic trigger and zero real trigger count, while active Phase C2 configuration remains `unconfigured`. The path remains fail-closed. Live Scheduled Task and adapter activation, final public DNS/Cloudflare cutover, independent external monitoring, and disposable rebuild/disaster-recovery proof remain separate work.

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

Normal releases use no interactive SSH. An approved GitHub-hosted Environment job binds exact intent bytes to GitHub OIDC and an explicit Deployment; a repository-scoped read-only GitHub App agent discovers it, and the root controller applies the existing one-lock host contracts. Staging deployment and same-fingerprint, already-provisioned Production promotion are covered. The repository controller now has the Phase C2 sequence for a fresh Production backup, local/deep verification, fixed Windows SFTP ingress upload, bounded canonical receipt plus detached-signature validation, pinned RSA-PSS/SHA-256 verification, and exact final durable-store readback before canonical evidence. The repository path ships unconfigured. Separate Windows host acceptance exercised and accepted the pre-Task-0078 helper's 1 GiB LocalSystem path with receipt/signature publication at 101.929 seconds. Task 0078 implements the future-active maximum nominal trigger opportunity gap of 30 seconds and bounds completed-history scans without activating it; final activation still requires zero pending pairs and a fresh benchmark against the final installed helper bytes. The permanent task remains disabled with no automatic trigger and zero real trigger count. Live Production migration changes therefore still fail closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`. The current VPS and GitHub configuration are activated only for automatic Staging deployment and the explicit, approved, main-only same-fingerprint Production promotion path; `v0.2.2` successfully exercised that path end to end.

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
- [ ] Separately activate and accept the recurring Windows Scheduled Task cadence on the live host
- [ ] Activate Phase C2 configuration, transfer a real Production encrypted backup, publish end-to-end signed durability evidence on the VPS, and accept the changed-migration-fingerprint gate
- [x] Implement and synthetically validate the isolated Production Monitoring repository contract
- [x] Record the reviewed Production Monitoring activation milestone at `v0.2.3`
- [ ] Verify the released Prometheus loopback proxy contract on the live host and add independent off-host monitoring
- [ ] Validate disposable rebuild/disaster recovery
- [ ] Complete a separately verified and approved public DNS/Cloudflare cutover
- Content review in all locales
- Accessibility, performance, SEO, and end-to-end validation

Public Product persistence, authentication, payments, a CMS, an admin dashboard, and customer acquisition automation remain outside the current phase. The active Inquiry PostgreSQL flow and deployed Production runtime do not by themselves establish that public Production cutover is complete.
