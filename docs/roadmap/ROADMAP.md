# YolPol Roadmap

## Privacy and future measurement

The localized Privacy Policy, footer legal link, Inquiry-consent link, metadata, and sitemap integration are implemented. No analytics tracker is active. Google Search Console is planned separately for search-performance monitoring; self-hosted Umami is the preferred future traffic analytics option, while GA4 remains deferred. Privacy content and consent requirements must be reviewed before any tracker is activated, and analytics implementation belongs in a separate future task or branch.

## Customer Inquiry presentation

Localized Inquiry submission, Product preselection, consent linkage, server validation, trusted Product resolution, and transactional PostgreSQL persistence are implemented. Distributed abuse controls and durable notification delivery remain deferred.

The PostgreSQL persistence foundation is active through the narrow Inquiry route. Cross-client idempotency, distributed abuse prevention, durable notification delivery, and operational retention remain deferred.

## Export Logistics foundation

The multilingual pallet-only planning page, verified Product packaging boundary, capacity assessment and buyer-arranged operational workflow are implemented. Freight pricing, carrier/customs integrations, axle calculations, partial pallets, saved plans and inquiry submission remain deferred.

## Operational deployment automation

The Production repository foundation and shared-ingress migration are complete. The repository-managed Phase B bootstrap contract, including Ubuntu 24.04 LTS/noble support, has been successfully applied and converged on the current VPS; `yolpol-bootstrap check` reports that the foundation is ready. Phase C1 is also implemented and activated: the deployment-agent timer is enabled and active, GitHub-side activation is complete for the verified main-only Production promotion path, Staging deploys automatically, and Production deploys only after explicit approval. Release `v0.2.2` (`48a566142bd0259c596314f6a01a92cc66d868ce`) completed that authenticated Staging-to-Production path, and both environments now identify it as active. The Production runtime is provisioned and healthy. Phase C2 off-server durability, Production Monitoring, final public DNS/Cloudflare cutover, and disposable rebuild/disaster-recovery proof remain separate work.

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

Normal releases use no interactive SSH. An approved GitHub-hosted Environment job binds exact intent bytes to GitHub OIDC and an explicit Deployment; a repository-scoped read-only GitHub App agent discovers it, and the root controller applies the existing one-lock host contracts. Staging deployment and same-fingerprint, already-provisioned Production promotion are covered. Production migration changes remain fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` until Phase C2 adds independently verified off-server durability. The current VPS and GitHub configuration are activated for automatic Staging deployment and the explicit, approved, main-only Production promotion path; `v0.2.2` successfully exercised that path end to end.

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
- [ ] Add Phase C2 off-server backup durability for Production-changing migrations
- [ ] Validate disposable rebuild/disaster recovery and activate Production monitoring
- [ ] Complete a separately verified and approved public DNS/Cloudflare cutover
- Content review in all locales
- Accessibility, performance, SEO, and end-to-end validation

Public Product persistence, authentication, payments, a CMS, an admin dashboard, and customer acquisition automation remain outside the current phase. The active Inquiry PostgreSQL flow and deployed Production runtime do not by themselves establish that public Production cutover is complete.
