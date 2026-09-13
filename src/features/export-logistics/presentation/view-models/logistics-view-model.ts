import type {ReadyLogisticsProductListing} from "@/features/export-logistics/application/dto/logistics-dto";
import type {PackagingSnapshot} from "@/features/export-logistics/domain/types/load-plan";

export type CalculatorProductOption = Readonly<{id: string; sku: string; name: string; packaging: PackagingSnapshot}>;
export type LogisticsPageModel =
  | Readonly<{status: "ready"; eligible: readonly CalculatorProductOption[]; unavailable: ReadyLogisticsProductListing["unavailable"]}>
  | Readonly<{status: "catalog_failure" | "malformed_catalog_data"}>;
