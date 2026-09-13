import type {LoadPlanResult} from "@/features/export-logistics/domain/types/load-plan";

export type LogisticsProductDto = Readonly<{id: string; sku: string; name: string; packaging?: Readonly<{unitsPerPackage: number; packagesPerPallet: number; unitsPerPallet: number; palletGrossWeightKg: number}>}>;
export type ReadyLogisticsProductListing = Readonly<{status: "ready"; eligible: readonly LogisticsProductDto[]; unavailable: readonly Pick<LogisticsProductDto, "id" | "sku" | "name">[]}>;
export type LogisticsProductListingResult = ReadyLogisticsProductListing | Readonly<{status: "catalog_failure" | "malformed_catalog_data"}>;
export type CalculateLoadPlanResponse = LoadPlanResult | Readonly<{status: "product_missing" | "product_unpublished" | "product_locale_unavailable" | "catalog_failure" | "malformed_catalog_data"; productId?: string}>;
