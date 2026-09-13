import type {CatalogProduct, LogisticsProductCatalog} from "@/features/export-logistics/application/ports/logistics-product-catalog";
import type {Locale} from "@/shared/types/locale";

export class FakeLogisticsProductCatalog implements LogisticsProductCatalog {
  constructor(private readonly products: readonly CatalogProduct[] = []) {}
  async listPublished(locale: Locale) { void locale; return this.products; }
  async findById(id: string, locale: Locale): Promise<unknown> { void locale; const product = this.products.find((item) => item.id === id); return product ? {status: "found", product} : {status: "missing"}; }
}
