# Inquiry contact, country, and pallet contract

## Decision

The public Inquiry contract accepts one or more preferred methods from `email`, `whatsapp`, and `telegram`; a normalized international main phone is always required. WhatsApp and Telegram details are required only when their methods are selected. Customer and destination country inputs use the approved 14 ISO country codes, ordered `IR`, `TR`, `IQ`, `AM`, `AZ`, `TM`, `AF`, `PK`, `AE`, `SA`, `QA`, `KW`, `BH`, `OM`; neither selector preselects a country.

Product demand is public and persisted as whole pallet counts only. An Inquiry is not a truck reservation, so requested pallet quantities are limited only by positive-integer and PostgreSQL persistence constraints; totals above 26 pallets are valid. The separate Export Logistics policy continues to describe a standard truck capacity of 26 pallets. Packaging arithmetic is resolved from trusted catalog data; packaging and internal pricing remain outside the public payload and Inquiry persistence.

## Persistence compatibility

Generated migration `0001_fast_wild_child` adds the complete conditional contact schema and ordered method array directly after the committed `0000`. Its upgrade policy preserves every legacy preference explicitly:

- `email` remains Email.
- `whatsapp` remains WhatsApp. A main phone matching the international-phone contract is normalized into `whatsapp_phone`; otherwise the WhatsApp intent is retained with no invented number, and legacy reconstitution remains tolerant.
- `telegram` remains Telegram. A missing leading `@` is added; legacy-safe identifiers that do not satisfy the stricter new public username contract remain readable.
- `phone` remains an internal historical-only marker. It is never accepted by the new public submission contract and is not relabeled as consent to another channel.

No feature-level corrective migration is required. Historical country strings and pieces/packages/pallets/truckloads remain readable; new submissions still enforce approved country codes and pallet-only items at the application boundary.

## Privacy and security

The localized Privacy inventory names the new contact, country, and pallet fields. The form exposes a visible Privacy Policy link and an accessible consent label. Existing strict JSON shape checks, body limit, origin policy, rate limiting, safe errors, and server-owned identifiers/timestamps remain unchanged.
