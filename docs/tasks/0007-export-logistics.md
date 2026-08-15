# 0007 — Export Logistics

## Outcome

Adds a statically generated multilingual `/[locale]/export-logistics` page and a pallet-only mixed-load calculator. The verified truck policy is 26 pallets and 26,000,000 grams gross weight; equality is feasible.

## Architecture

The five-layer Export Logistics feature owns a pure, immutable calculation service, application Product-packaging port and use cases, Product application anti-corruption adapter, presentation mapping and isolated calculator Client Component, and testing helpers. Product packaging remains owned by the Product dataset and reaches this feature through application DTO queries; no production values are duplicated.

## Outcomes and limits

The domain explicitly returns feasible, pallet-only exceed, weight-only exceed, both-limits exceed, insufficient data, invalid plan, or arithmetic overflow. Input is Product ID plus a positive whole pallet count. Authoritative arithmetic uses integer grams and checked safe-integer multiplication/addition.

Customer-owned input is validated completely before Product catalog access. The catalog boundary runtime-validates identity, publication status, locale, packaging consistency, and Product correlation. Listing dependency failures use explicit `catalog_failure` and `malformed_catalog_data` results rather than exceptions or fabricated empty catalogs.

The browser uses a strict ASCII positive-decimal parser with leading zeroes prohibited. This parser is UX protection only; the domain independently validates every request. All calculation outcomes, dependency failures, and kilogram units have localized presentation messages.

## Operations and disclaimer

The page documents the approved buyer-arranged transport, payment, settlement, release and carrier exit workflow. Results are planning information, not booking, freight pricing, legal/customs approval, vehicle acceptance, or delivery guarantees.

## Deferred

Carrier integrations, freight pricing, customs, axle calculations, partial pallets, saved/shared plans, inquiry submission, and Product data completion remain out of scope.
