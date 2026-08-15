import type {LogisticsProductCatalog} from "@/features/export-logistics/application/ports/logistics-product-catalog";
import type {ProductDto} from "@/features/products/application/dto/product-dto";
import type {Locale} from "@/shared/types/locale";

type ProductQuery = Readonly<{
  listPublished(locale: Locale): Promise<readonly ProductDto[]>;
  findById(id: string, locale: Locale): Promise<Readonly<{status: "found"; product: ProductDto}> | Readonly<{status: "missing" | "unpublished" | "locale_unavailable" | "invalid_product_id"}>>;
}>;

export class ProductApplicationLogisticsAdapter implements LogisticsProductCatalog {
  constructor(private readonly query: ProductQuery) {}
  async listPublished(locale: Locale): Promise<unknown> {
    const result: unknown = await this.query.listPublished(locale);
    return Array.isArray(result) ? result.map(mapProduct) : result;
  }
  async findById(id: string, locale: Locale): Promise<unknown> {
    const result: unknown = await this.query.findById(id, locale);
    if (typeof result !== "object" || result === null || Array.isArray(result)) return result;
    const lookup = result as {status?: unknown; product?: unknown};
    if (lookup.status === "invalid_product_id") return {status: "malformed_catalog_data"};
    return lookup.status === "found" ? {status: "found", product: mapProduct(lookup.product)} : result;
  }
}

function mapProduct(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const product = value as Partial<ProductDto>;
  const packaging = typeof product.packaging === "object" && product.packaging !== null
    ? Object.freeze({...product.packaging})
    : product.packaging;
  return Object.freeze({id: product.id, sku: product.sku, name: product.name, status: product.status, locale: product.locale, packaging});
}
