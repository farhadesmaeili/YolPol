import type {LogisticsProductListingResult} from "@/features/export-logistics/application/dto/logistics-dto";
import type {LoadPlanResult} from "@/features/export-logistics/domain/types/load-plan";
import type {LogisticsPageModel} from "@/features/export-logistics/presentation/view-models/logistics-view-model";

export type CalculationMessageKey =
  | "feasible"
  | "palletExceeded"
  | "weightExceeded"
  | "bothExceeded"
  | "insufficientData"
  | "invalid"
  | "arithmeticOverflow";

export function presentLogisticsProducts(result: LogisticsProductListingResult): LogisticsPageModel {
  if (result.status !== "ready") return Object.freeze({status: result.status});
  return Object.freeze({
    status: "ready",
    eligible: Object.freeze(result.eligible.flatMap((product) => product.packaging ? [Object.freeze({
      id: product.id,
      sku: product.sku,
      name: product.name,
      packaging: Object.freeze({productId: product.id, sku: product.sku, productName: product.name, unitsPerPackage: product.packaging.unitsPerPackage, packagesPerPallet: product.packaging.packagesPerPallet, unitsPerPallet: product.packaging.unitsPerPallet, grossPalletWeightGrams: product.packaging.palletGrossWeightKg * 1000}),
    })] : [])),
    unavailable: Object.freeze(result.unavailable.map((product) => Object.freeze({...product}))),
  });
}

export function calculationMessageKey(result: LoadPlanResult): CalculationMessageKey {
  switch (result.status) {
    case "insufficient_data": return "insufficientData";
    case "invalid_plan": return "invalid";
    case "arithmetic_overflow": return "arithmeticOverflow";
    case "calculated":
      switch (result.assessment) {
        case "feasible": return "feasible";
        case "exceeds_pallet_limit": return "palletExceeded";
        case "exceeds_weight_limit": return "weightExceeded";
        case "exceeds_pallet_and_weight_limits": return "bothExceeded";
      }
  }
}
