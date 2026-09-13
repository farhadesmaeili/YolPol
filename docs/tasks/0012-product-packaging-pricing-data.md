# Product packaging and internal pricing data

## Approved production data

Internal unit prices are positive safe integers in Iranian rials (IRR), per bottle, excluding the cap. They are confidential production data and do not alter YolPol's public inquiry-only commercial model.

| Product | Internal IRR per bottle | Units/package | Packages/pallet | Units/pallet | Gross pallet kg | Units/26-pallet truck |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 250 ml olive-green round | 180000 | 70 | 64 | 4480 | 925 | 116480 |
| 250 ml olive-green square | 180000 | 56 | 81 | 4536 | 960 | 117936 |
| 250 ml clear round | 180000 | 70 | 64 | 4480 | 925 | 116480 |
| 250 ml clear square | 180000 | 56 | 81 | 4536 | 960 | 117936 |
| 500 ml olive-green round | 230000 | 36 | 63 | 2268 | 790 | 58968 |
| 500 ml olive-green square | 230000 | 35 | 70 | 2450 | 815 | 63700 |
| 500 ml clear round | 230000 | 36 | 63 | 2268 | 790 | 58968 |
| 500 ml clear square | 230000 | 35 | 70 | 2450 | 815 | 63700 |
| 700 ml olive-green round | 350000 | 28 | 56 | 1568 | 700 | 40768 |

Units per pallet are derived as `unitsPerPackage * packagesPerPallet`. Units per truck are not stored in Product data: Product composition derives them as `unitsPerPallet * 26` using Export Logistics' authoritative maximum-pallet policy. Gross logistics weight is projected as approved kilograms multiplied by 1000.

The four clear Products inherit the verified profile of the olive-green Product with the same volume and shape: 250 ml round to 250 ml round, 250 ml square to 250 ml square, 500 ml round to 500 ml round, and 500 ml square to 500 ml square. All nine published Products are therefore eligible for Export Logistics; none is unavailable for missing packaging.

Internal prices are stored on the Product aggregate's internal pricing value in static production records as `{amount, currency: "IRR"}`. The public Product DTO explicitly maps this to `{mode: "inquiry"}` and omits the internal value. Public view models, calculator options, inquiry snapshots, metadata, JSON-LD, and browser-facing output consume that safe projection.

Inquiry contact-method work and pallet-only Inquiry quantities are deferred to their own branch. This task does not change Inquiry contracts, persistence, or submission behavior.
