import type {PackagingSnapshot} from "@/features/export-logistics/domain/types/load-plan";

export function packagingFixture(overrides: Partial<PackagingSnapshot> = {}): PackagingSnapshot {
  return {productId: "product-1", sku: "SKU-1", productName: "Test bottle", unitsPerPackage: 10, packagesPerPallet: 10, unitsPerPallet: 100, grossPalletWeightGrams: 100_000, ...overrides};
}
