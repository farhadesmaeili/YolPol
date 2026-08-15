import type {CalculateLoadPlanResponse} from "@/features/export-logistics/application/dto/logistics-dto";
import {validateCatalogProduct} from "@/features/export-logistics/application/mappers/packaging-snapshot-mapper";
import type {LogisticsProductCatalog} from "@/features/export-logistics/application/ports/logistics-product-catalog";
import {calculateLoadPlan} from "@/features/export-logistics/domain/services/calculate-load-plan";
import {validateLoadPlanRequest} from "@/features/export-logistics/domain/services/validate-load-plan-request";
import type {Locale} from "@/shared/types/locale";

export class CalculateExportLoadPlan {
  constructor(private readonly catalog: LogisticsProductCatalog) {}
  async execute(request: unknown, locale: Locale): Promise<CalculateLoadPlanResponse> {
    const validation = validateLoadPlanRequest(request);
    if (validation.status === "invalid") return {status: "invalid_plan", reason: validation.reason};
    try {
      const trusted = [];
      for (const line of validation.lines) {
        const result = await this.catalog.findById(line.productId, locale);
        if (typeof result !== "object" || result === null || Array.isArray(result) || !("status" in result)) return {status: "malformed_catalog_data", productId: line.productId};
        const lookup = result as {status: unknown; product?: unknown};
        if (lookup.status === "missing") return {status: "product_missing", productId: line.productId};
        if (lookup.status === "unpublished") return {status: "product_unpublished", productId: line.productId};
        if (lookup.status === "locale_unavailable") return {status: "product_locale_unavailable", productId: line.productId};
        if (lookup.status !== "found") return {status: "malformed_catalog_data", productId: line.productId};
        const product = validateCatalogProduct(lookup.product, locale, line.productId);
        if (product.status === "unpublished") return {status: "product_unpublished", productId: line.productId};
        if (product.status === "locale_unavailable") return {status: "product_locale_unavailable", productId: line.productId};
        if (product.status === "malformed") return {status: "malformed_catalog_data", productId: line.productId};
        trusted.push({productId: line.productId, palletCount: line.palletCount, packaging: product.product.packaging});
      }
      return calculateLoadPlan(trusted);
    } catch { return {status: "catalog_failure"}; }
  }
}
