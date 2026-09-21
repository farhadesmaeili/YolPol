# YolPol Roadmap

## Privacy and future measurement

The localized Privacy Policy, footer legal link, Inquiry-consent link, metadata, and sitemap integration are implemented. No analytics tracker is active. Google Search Console is planned separately for search-performance monitoring; self-hosted Umami is the preferred future traffic analytics option, while GA4 remains deferred. Privacy content and consent requirements must be reviewed before any tracker is activated, and analytics implementation belongs in a separate future task or branch.

## Customer Inquiry presentation

Localized Inquiry submission, Product preselection, consent linkage, server validation, trusted Product resolution, and transactional PostgreSQL persistence are implemented. Distributed abuse controls and durable notification delivery remain deferred.

The PostgreSQL persistence foundation is active through the narrow Inquiry route. Cross-client idempotency, distributed abuse prevention, durable notification delivery, operational retention, and authenticated release deployment remain deferred.

## Export Logistics foundation

The multilingual pallet-only planning page, verified Product packaging boundary, capacity assessment and buyer-arranged operational workflow are implemented. Freight pricing, carrier/customs integrations, axle calculations, partial pallets, saved plans and inquiry submission remain deferred.

## Operational deployment automation

The Production repository foundation, the current VPS's manual shared-ingress migration, the repository-managed Phase B host-bootstrap contract, and the repository-only Phase C1 authenticated deployment contract are complete. The current VPS audit identified Ubuntu 24.04 LTS/noble, so Task 0067 is the release-blocking compatibility correction that adds it to the previously Debian-12-only bootstrap allow-list. The trusted bootstrap source was established on the live VPS and `apply` was attempted, but source validation was followed by a fail-closed rejection at the supported-host gate; prerequisite, identity, directory, and managed-contract installation did not begin, so Phase B did not converge or activate. Phase C1 was not activated either. GitHub Environment/App configuration, Production provisioning/public activation, Phase C2 off-server durability, and disaster-recovery validation remain separate work. Release `v0.1.8` remains untagged until bootstrap and control-plane readiness is complete.

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

Normal releases use no interactive SSH. An approved GitHub-hosted Environment job binds exact intent bytes to GitHub OIDC and an explicit Deployment; a repository-scoped read-only GitHub App agent discovers it, and the root controller applies the existing one-lock host contracts. Staging deployment and same-fingerprint, already-provisioned Production promotion are covered. Production migration changes remain fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` until Phase C2 adds independently verified off-server durability. VPS activation and GitHub settings are not complete.

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
- [x] Add the isolated repository-side Production deployment contract (not deployed)
- [x] Implement Task 0064 and complete the manual shared-host-ingress and Staging Monitoring migration on the current VPS
- [x] Automate the repository-managed server bootstrap contract, including the Ubuntu 24.04/noble compatibility fix (the earlier apply attempt failed closed at the supported-host gate; Phase B did not converge or activate)
- [ ] Automate authenticated release deployment
- [ ] Validate disposable rebuild/disaster recovery and activate Production monitoring
- [ ] Bootstrap and deploy the real Production environment after explicit approval
- Content review in all locales
- Accessibility, performance, SEO, and end-to-end validation

Public Product persistence, authentication, payments, a CMS, an admin dashboard, and customer acquisition automation remain outside the current phase. The inactive Inquiry PostgreSQL foundation does not make public submission or production operations complete.
