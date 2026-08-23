import type {StaticTechnicalProductRecord} from "@/features/products/infrastructure/data/static-product-records";

const catalogRecordedAt = "2026-08-15T00:58:21.000Z";
const categories = ["olive-oil", "food", "beverage"] as const;

export const technicalProducts: readonly StaticTechnicalProductRecord[] = [
  product({
    id: "ylp-gb-250-og-rd",
    sku: "YLP-GB-250-OG-RD",
    slug: "250ml-olive-green-round-glass-bottle",
    capacityMl: 250,
    glassColor: "olive-green",
    bottleShape: "round",
    internalUnitPriceIrr: 180_000,
    packaging: {unitsPerPackage: 70, packagesPerPallet: 64, palletGrossWeightKg: 925},
  }),
  product({
    id: "ylp-gb-250-og-sq",
    sku: "YLP-GB-250-OG-SQ",
    slug: "250ml-olive-green-square-glass-bottle",
    capacityMl: 250,
    glassColor: "olive-green",
    bottleShape: "square",
    internalUnitPriceIrr: 180_000,
    packaging: {unitsPerPackage: 56, packagesPerPallet: 81, palletGrossWeightKg: 960},
  }),
  product({
    id: "ylp-gb-250-cl-rd",
    sku: "YLP-GB-250-CL-RD",
    slug: "250ml-clear-round-glass-bottle",
    capacityMl: 250,
    glassColor: "clear",
    bottleShape: "round",
    internalUnitPriceIrr: 180_000,
    packaging: {unitsPerPackage: 70, packagesPerPallet: 64, palletGrossWeightKg: 925},
  }),
  product({
    id: "ylp-gb-250-cl-sq",
    sku: "YLP-GB-250-CL-SQ",
    slug: "250ml-clear-square-glass-bottle",
    capacityMl: 250,
    glassColor: "clear",
    bottleShape: "square",
    internalUnitPriceIrr: 180_000,
    packaging: {unitsPerPackage: 56, packagesPerPallet: 81, palletGrossWeightKg: 960},
  }),
  product({
    id: "ylp-gb-500-og-rd",
    sku: "YLP-GB-500-OG-RD",
    slug: "500ml-olive-green-round-glass-bottle",
    capacityMl: 500,
    glassColor: "olive-green",
    bottleShape: "round",
    internalUnitPriceIrr: 230_000,
    packaging: {unitsPerPackage: 36, packagesPerPallet: 63, palletGrossWeightKg: 790},
  }),
  product({
    id: "ylp-gb-500-og-sq",
    sku: "YLP-GB-500-OG-SQ",
    slug: "500ml-olive-green-square-glass-bottle",
    capacityMl: 500,
    glassColor: "olive-green",
    bottleShape: "square",
    internalUnitPriceIrr: 230_000,
    packaging: {unitsPerPackage: 35, packagesPerPallet: 70, palletGrossWeightKg: 815},
  }),
  product({
    id: "ylp-gb-500-cl-rd",
    sku: "YLP-GB-500-CL-RD",
    slug: "500ml-clear-round-glass-bottle",
    capacityMl: 500,
    glassColor: "clear",
    bottleShape: "round",
    internalUnitPriceIrr: 230_000,
    packaging: {unitsPerPackage: 36, packagesPerPallet: 63, palletGrossWeightKg: 790},
  }),
  product({
    id: "ylp-gb-500-cl-sq",
    sku: "YLP-GB-500-CL-SQ",
    slug: "500ml-clear-square-glass-bottle",
    capacityMl: 500,
    glassColor: "clear",
    bottleShape: "square",
    internalUnitPriceIrr: 230_000,
    packaging: {unitsPerPackage: 35, packagesPerPallet: 70, palletGrossWeightKg: 815},
  }),
  product({
    id: "ylp-gb-700-og-rd",
    sku: "YLP-GB-700-OG-RD",
    slug: "700ml-olive-green-round-glass-bottle",
    capacityMl: 700,
    glassColor: "olive-green",
    bottleShape: "round",
    internalUnitPriceIrr: 350_000,
    packaging: {unitsPerPackage: 28, packagesPerPallet: 56, palletGrossWeightKg: 700},
  }),
];

function product(
  input: Pick<StaticTechnicalProductRecord, "id" | "sku" | "slug"> &
    Required<Pick<StaticTechnicalProductRecord["specifications"], "capacityMl" | "glassColor" | "bottleShape">> &
    Pick<StaticTechnicalProductRecord, "packaging"> &
    Readonly<{internalUnitPriceIrr: number}>,
): StaticTechnicalProductRecord {
  return {
    id: input.id,
    sku: input.sku,
    slug: input.slug,
    categories,
    status: "published",
    specifications: {
      capacityMl: input.capacityMl,
      glassColor: input.glassColor,
      bottleShape: input.bottleShape,
    },
    packaging: input.packaging,
    pricing: {
      mode: "inquiry",
      internalUnitPrice: {amount: input.internalUnitPriceIrr, currency: "IRR"},
    },
    images: [
      {
        id: `${input.id}-primary`,
        source: `/images/products/${input.slug}/01-primary.webp`,
        sortOrder: 0,
        isPrimary: true,
      },
    ],
    createdAt: catalogRecordedAt,
    updatedAt: catalogRecordedAt,
  };
}
