# Task 0004: Verified Product Catalog Data

- Status: Implemented
- Date: 2026-08-15

## Scope

Publish nine business-verified glass-bottle records with four-locale content and the nine tracked WebP images. The approved SKU convention is `YLP-GB-{capacity}-{color}-{shape}`, using `OG`/`CL` for olive-green/clear glass and `RD`/`SQ` for round/square bottles. Slugs remain global and language-independent.

## Product Model

Products own a non-empty, unique, immutable category collection. The taxonomy is `olive-oil`, `food`, `beverage`, and `pharmaceutical`; every current Product belongs to the first three and none belongs to pharmaceutical. Localized application copy remains separate from these machine-readable categories.

Glass is the verified material for all nine current Products. Other verified technical attributes are capacity, the closed glass-color values `olive-green`/`clear`, and the closed bottle-shape values `round`/`square`. Neck finish, bottle weight, height, diameter, and other future technical fields remain optional and are not populated without verification. Pharmaceutical remains a supported future taxonomy category, while current published listing copy reflects only the assigned olive-oil, food, and beverage applications.

## Packaging and Pricing

An optional Packaging Profile stores units per package, packages per pallet, and gross pallet weight. Units per pallet is derived as `unitsPerPackage * packagesPerPallet` and is never persisted independently. Five olive-green Products have verified profiles; the four clear Products omit packaging. Truck quantities and the 26-pallet planning rule belong to a future `export-logistics` feature.

All current Products use inquiry-only pricing. Numeric IRR amounts are deliberately not stored or exposed publicly. A future visible-price policy must define amount, currency, basis, cap inclusion, and validity requirements before implementation.

## Content, Images, and Rendering

Each Product has English, Turkish, Persian, and Arabic factual content plus localized primary-image alternative text. One tracked image at `/images/products/{slug}/01-primary.webp` belongs to each Product. Images are source assets and are not generated or transformed by the catalog dataset.

Catalog cards and details display localized categories, capacity, color, shape, inquiry pricing, and packaging only when present. Listing copy and metadata reflect the actual category assignments of the published catalog. Product JSON-LD uses the localized verified glass material and other verified visible fields, and never emits Offer, numeric price, currency, availability, rating, or review data.

## Static Delivery and Future Sources

The nine Products produce 36 statically generated localized detail routes and 44 sitemap URLs including home and listing pages. `dynamicParams = false` means new local records require a rebuild. A future CMS adapter can implement the existing repository port, but runtime additions require an explicit dynamic-rendering or revalidation decision.
