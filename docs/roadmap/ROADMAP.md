# YolPol Roadmap

## Privacy and future measurement

The localized Privacy Policy, footer legal link, Inquiry-consent link, metadata, and sitemap integration are implemented. No analytics tracker is active. Google Search Console is planned separately for search-performance monitoring; self-hosted Umami is the preferred future traffic analytics option, while GA4 remains deferred. Privacy content and consent requirements must be reviewed before any tracker is activated, and analytics implementation belongs in a separate future task or branch.

## Customer Inquiry presentation

Localized Inquiry submission, Product preselection, consent linkage, server validation, trusted Product resolution, and transactional PostgreSQL persistence are implemented. Distributed abuse controls and durable notification delivery remain deferred.

The PostgreSQL persistence foundation is active through the narrow Inquiry route. Cross-client idempotency, distributed abuse prevention, durable notification delivery, operational retention, and deployment automation remain deferred.

## Export Logistics foundation

The multilingual pallet-only planning page, verified Product packaging boundary, capacity assessment and buyer-arranged operational workflow are implemented. Freight pricing, carrier/customs integrations, axle calculations, partial pallets, saved plans and inquiry submission remain deferred.

## Operational deployment automation (planned)

The phases below record the agreed operational direction. The Production repository foundation and the current VPS's manual shared-ingress migration are complete, but Production deployment, host bootstrap automation, automated release promotion, and disaster-recovery validation do not yet exist. Remaining phases must be designed, implemented, reviewed, and validated separately.

### Phase A - Production Deployment Foundation

- Add repository-managed Production Compose and configuration.
- Isolate Production completely from Staging.
- Give Production independent databases, volumes, backend/ingress networks, backups, credentials, Telegram bot, and runtime configuration.
- Deploy only immutable release digest references.
- Preserve production-safe restricted operations.

### Phase B - Server Bootstrap Automation

The goal is one standard workflow that converts a clean or disposable VPS into a YOLPOL-ready host.

The planned automation should cover:

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

The target release flow is:

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

Normal releases should not require interactive SSH.

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
- [ ] Automate server bootstrap and authenticated release deployment
- [ ] Validate disposable rebuild/disaster recovery and activate Production monitoring
- [ ] Bootstrap and deploy the real Production environment after explicit approval
- Content review in all locales
- Accessibility, performance, SEO, and end-to-end validation

Public Product persistence, authentication, payments, a CMS, an admin dashboard, and customer acquisition automation remain outside the current phase. The inactive Inquiry PostgreSQL foundation does not make public submission or production operations complete.
