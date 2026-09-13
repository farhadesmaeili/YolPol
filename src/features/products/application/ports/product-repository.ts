import type {Product} from "@/features/products/domain/entities/product";
import type {
  ProductCategory,
  ProductStatus,
} from "@/features/products/domain/types/product-types";
import type {ProductId} from "@/features/products/domain/value-objects/product-id";
import type {ProductSlug} from "@/features/products/domain/value-objects/product-slug";

export type ProductListQuery = Readonly<{
  category?: ProductCategory;
  status?: ProductStatus;
}>;

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findBySlug(slug: ProductSlug): Promise<Product | null>;
  list(query?: ProductListQuery): Promise<readonly Product[]>;
}
