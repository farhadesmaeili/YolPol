import type {LogisticsProductListingResult, LogisticsProductDto} from "@/features/export-logistics/application/dto/logistics-dto";
import {validateCatalogProduct} from "@/features/export-logistics/application/mappers/packaging-snapshot-mapper";
import type {LogisticsProductCatalog} from "@/features/export-logistics/application/ports/logistics-product-catalog";
import type {Locale} from "@/shared/types/locale";

export class ListEligibleLogisticsProducts {
  constructor(private readonly catalog: LogisticsProductCatalog) {}
  async execute(locale: Locale): Promise<LogisticsProductListingResult> {
    try {
      const values = await this.catalog.listPublished(locale);
      if (!Array.isArray(values)) return Object.freeze({status: "malformed_catalog_data"});
      const eligible: LogisticsProductDto[] = [];
      const unavailable: Pick<LogisticsProductDto, "id" | "sku" | "name">[] = [];
      const productIds = new Set<string>();
      for (const value of values) {
        const validation = validateCatalogProduct(value, locale);
        if (validation.status !== "valid" || productIds.has(validation.product.id)) return Object.freeze({status: "malformed_catalog_data"});
        const product = validation.product;
        productIds.add(product.id);
        if (!product.packaging) unavailable.push(Object.freeze({id: product.id, sku: product.sku, name: product.name}));
        else eligible.push(Object.freeze({id: product.id, sku: product.sku, name: product.name, packaging: Object.freeze({unitsPerPackage: product.packaging.unitsPerPackage, packagesPerPallet: product.packaging.packagesPerPallet, unitsPerPallet: product.packaging.unitsPerPallet, palletGrossWeightKg: product.packaging.grossPalletWeightGrams / 1000})}));
      }
      return Object.freeze({status: "ready", eligible: Object.freeze(eligible), unavailable: Object.freeze(unavailable)});
    } catch {
      return Object.freeze({status: "catalog_failure"});
    }
  }
}
