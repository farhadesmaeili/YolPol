# 0007 — Wholesale Process and Reference Load Planning

## Outcome

Adds a statically generated multilingual `/[locale]/wholesale-process` page and a pallet-only mixed-load calculator. The former `/[locale]/export-logistics` URLs permanently redirect to the new public route. The calculator uses 26 pallets and approximately 26,000 kilograms as a reference planning envelope, not a universal vehicle or legal limit.

## Architecture

The internal five-layer Export Logistics feature name remains unchanged to avoid architectural churn. It owns a pure, immutable calculation service, application Product-packaging port and use cases, Product application anti-corruption adapter, presentation mapping and isolated calculator Client Component, and testing helpers. Product packaging remains owned by the Product dataset and reaches this feature through application DTO queries; no production values are duplicated.

## Outcomes and limits

The domain explicitly returns feasible, pallet-only exceed, weight-only exceed, both-limits exceed, insufficient data, invalid plan, or arithmetic overflow. Input is Product ID plus a positive whole pallet count. Authoritative arithmetic uses integer grams and checked safe-integer multiplication/addition.

Customer-owned input is validated completely before Product catalog access. The catalog boundary runtime-validates identity, publication status, locale, packaging consistency, and Product correlation. Listing dependency failures use explicit `catalog_failure` and `malformed_catalog_data` results rather than exceptions or fabricated empty catalogs.

The browser uses a strict ASCII positive-decimal parser with leading zeroes prohibited. This parser is UX protection only; the domain independently validates every request. All calculation outcomes, dependency failures, and kilogram units have localized presentation messages.

## Operations and disclaimer

The page documents product selection, wholesale inquiry, commercial confirmation, buyer-arranged transportation, arrival, optional inspection, loading, agreed payment or commercial terms, cargo release, and the buyer's onward-transport responsibility. Results are reference planning information, not a freight quotation, carrier acceptance, legal or customs approval, vehicle acceptance, or a delivery promise. Vehicle, axle, road, carrier, customs, and border limits may vary.

## Deferred

Carrier integrations, freight pricing, customs, axle calculations, partial pallets, saved/shared plans, inquiry submission, and Product data completion remain out of scope.
