export const truckCapacityPolicy = Object.freeze({
  maxPallets: 26,
  maxGrossWeightGrams: 26_000_000,
});

export const maxRequestedPalletsPerLine = 1_000_000_000;

export type PackagingSnapshot = Readonly<{
  productId: string;
  sku: string;
  productName: string;
  unitsPerPackage: number;
  packagesPerPallet: number;
  unitsPerPallet: number;
  grossPalletWeightGrams: number;
}>;

export type LoadPlanInputLine = Readonly<{
  productId: string;
  palletCount: unknown;
  packaging?: PackagingSnapshot;
}>;

export type CalculatedLoadLine = Readonly<{
  packaging: PackagingSnapshot;
  palletCount: number;
  totalPackages: number;
  totalBottleUnits: number;
  totalGrossWeightGrams: number;
}>;

export type LoadPlanTotals = Readonly<{
  pallets: number;
  packages: number;
  bottleUnits: number;
  grossWeightGrams: number;
}>;

export type LoadPlanAssessment =
  | "feasible"
  | "exceeds_pallet_limit"
  | "exceeds_weight_limit"
  | "exceeds_pallet_and_weight_limits";

export type LoadPlanResult =
  | Readonly<{status: "calculated"; assessment: LoadPlanAssessment; lines: readonly CalculatedLoadLine[]; totals: LoadPlanTotals}>
  | Readonly<{status: "insufficient_data"; productIds: readonly string[]}>
  | Readonly<{status: "invalid_plan"; reason: string}>
  | Readonly<{status: "arithmetic_overflow"}>;
