# Task 0008: Customer Inquiry Presentation

- Status: Implemented
- Date: 2026-08-16

Adds four localized Inquiry pages, published-Product selection, safe Product-ID preselection, locally validated application-compatible drafts, and canonical contact fallbacks. Secure online submission remains unavailable; no personal data is transmitted, placed in URLs, or stored in browser storage.

The Server Component obtains narrow localized Product options through composition. The Client Component owns only transient interaction. Machine-readable contacts, IDs, and SKUs remain canonical ASCII. Shared bidi primitives isolate LTR technical text, while `Intl.NumberFormat` owns localized human numbers and number/unit groups.

Metadata, clean canonicals, alternates, Breadcrumb JSON-LD, navigation, sitemap integration, labels, consent, responsive layouts, live feedback, and Product-specific remove names are included. The consent experience now links to the localized Privacy Policy implemented by Task 0009. Persistence, abuse controls, notifications, and durable delivery remain deferred.

Every selected Product owns an explicit, mandatory requested quantity and canonical unit (`pieces`, `packages`, `pallets`, or `truckloads`). New and preselected lines begin empty, so neither quantity nor unit is silently inferred from trusted Product or logistics data. The presentation mapper reuses the Inquiry domain's framework-independent normalization boundary and returns typed, line-specific failures that connect localized errors to controls with `aria-invalid` and `aria-describedby`. Any form edit clears the previous reviewed result.

Product preselection accepts exactly one non-empty, available `product` query value. Missing, invalid, whitespace, repeated (including repeated-identical), or excessive values produce no preselection. Query variants never affect canonical metadata or the sitemap. Shared human-number formatting returns a neutral em dash for `NaN` and positive or negative infinity rather than presenting them as business quantities.

Before the first Product is explicitly chosen, the Product fieldset presents a localized neutral empty state with guidance and one placeholder-driven add control. A resolved valid query preselection bypasses that state. Once populated, the guidance is replaced by Product rows and a compact “add another Product” control; removing the final row restores the empty state without carrying review feedback, quantity, or unit values forward.

The localized Server Component resolves and passes only the active locale's serializable form labels; the Client Component does not import locale catalogs. A presentation reducer owns transient fields, Product rows, preselection resolution, validation feedback, and stale-review clearing without owning domain rules. Requested quantity and unit controls expose localized visible required wording and native `required` semantics. When all nine localized Products are selected, the add interaction is replaced by a neutral localized completion message until a Product is removed.
