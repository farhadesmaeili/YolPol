import type {
  ProductListQuery,
  ProductRepository,
} from "@/features/products/application/ports/product-repository";
import type {Product} from "@/features/products/domain/entities/product";
import type {ProductId} from "@/features/products/domain/value-objects/product-id";
import type {ProductSlug} from "@/features/products/domain/value-objects/product-slug";

export class FakeProductRepository implements ProductRepository {
  readonly listQueries: ProductListQuery[] = [];

  constructor(private readonly products: readonly Product[]) {}

  async findById(id: ProductId): Promise<Product | null> {
    return this.products.find((product) => product.id.value === id.value) ?? null;
  }

  async findBySlug(slug: ProductSlug): Promise<Product | null> {
    return this.products.find((product) => product.slug.value === slug.value) ?? null;
  }

  async list(query: ProductListQuery = {}): Promise<readonly Product[]> {
    this.listQueries.push({...query});
    return this.products.filter(
      (product) =>
        (query.category === undefined || product.category === query.category) &&
        (query.status === undefined || product.status === query.status),
    );
  }
}
