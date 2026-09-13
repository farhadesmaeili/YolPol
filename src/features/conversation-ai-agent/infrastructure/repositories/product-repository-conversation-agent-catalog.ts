import type {ConversationAgentProductCatalog} from "@/features/conversation-ai-agent/application/ports/conversation-agent-ports";
import type {ConversationAgentProductSearch, PublicConversationAgentProduct} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import type {ProductDto} from "@/features/products/application/dto/product-dto";
import type {ProductRepository} from "@/features/products/application/ports/product-repository";
import {ListProducts} from "@/features/products/application/use-cases/list-products";
import {truckCapacityPolicy} from "@/features/export-logistics/domain/types/load-plan";
import type {Locale} from "@/shared/types/locale";

const maximumSearchResults = 10;

function multiplySafely(left: number, right: number): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError("Agent Product quantity exceeds the safe integer limit.");
  return value;
}

function toPublicProduct(product: ProductDto): PublicConversationAgentProduct {
  return Object.freeze({
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    locale: product.locale,
    name: product.name,
    shortDescription: product.shortDescription,
    applications: Object.freeze([...product.applications]),
    categories: Object.freeze([...product.categories]),
    specifications: Object.freeze({
      capacityMl: product.specifications.capacityMl,
      glassColor: product.specifications.glassColor,
      bottleShape: product.specifications.bottleShape,
      neckFinish: product.specifications.neckFinish,
      weightGrams: product.specifications.weightGrams,
      heightMm: product.specifications.heightMm,
      diameterMm: product.specifications.diameterMm,
    }),
    ...(product.packaging ? {packaging: Object.freeze({
      unitsPerPackage: product.packaging.unitsPerPackage,
      packagesPerPallet: product.packaging.packagesPerPallet,
      unitsPerPallet: product.packaging.unitsPerPallet,
      palletGrossWeightKg: product.packaging.palletGrossWeightKg,
      referenceLoadPallets: truckCapacityPolicy.maxPallets,
      unitsPerReferenceLoad: multiplySafely(product.packaging.unitsPerPallet, truckCapacityPolicy.maxPallets),
    })} : {}),
  });
}

function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().trim(); }
function matches(product: ProductDto, input: ConversationAgentProductSearch): boolean {
  if (input.sku && normalize(product.sku) !== normalize(input.sku)) return false;
  if (input.capacityMl !== undefined && product.specifications.capacityMl !== input.capacityMl) return false;
  if (input.glassColor !== undefined && product.specifications.glassColor !== input.glassColor) return false;
  if (input.bottleShape !== undefined && product.specifications.bottleShape !== input.bottleShape) return false;
  if (input.category !== undefined && !product.categories.includes(input.category)) return false;
  if (input.query) {
    const query = normalize(input.query);
    const searchable = [product.id, product.sku, product.slug, product.name, product.shortDescription, ...product.applications, ...product.categories].map(normalize);
    if (!searchable.some((value) => value.includes(query))) return false;
  }
  return true;
}

export class ProductRepositoryConversationAgentCatalog implements ConversationAgentProductCatalog {
  private readonly listProducts: ListProducts;
  constructor(repository: ProductRepository) { this.listProducts = new ListProducts(repository); }

  async search(input: ConversationAgentProductSearch & Readonly<{locale: Locale}>): Promise<readonly PublicConversationAgentProduct[]> {
    const {products} = await this.listProducts.execute({locale: input.locale, status: "published"});
    return Object.freeze(products.filter((product) => product.status === "published" && matches(product, input)).slice(0, maximumSearchResults).map(toPublicProduct));
  }

  async getDetails(input: Readonly<{productId?: string; sku?: string; slug?: string; locale: Locale}>): Promise<PublicConversationAgentProduct | null> {
    const {products} = await this.listProducts.execute({locale: input.locale, status: "published"});
    const product = products.find((candidate) => candidate.status === "published" && (
      (input.productId !== undefined && candidate.id === input.productId)
      || (input.sku !== undefined && normalize(candidate.sku) === normalize(input.sku))
      || (input.slug !== undefined && candidate.slug === input.slug)));
    return product ? toPublicProduct(product) : null;
  }
}
