import {toProductDto} from "@/features/products/application/mappers/product-dto-mapper";
import type {
  ProductListQuery,
  ProductRepository,
} from "@/features/products/application/ports/product-repository";
import type {ListProductsResult} from "@/features/products/application/results/product-query-results";
import type {Locale} from "@/shared/types/locale";

export type ListProductsInput = ProductListQuery & Readonly<{locale: Locale}>;

export class ListProducts {
  constructor(private readonly repository: ProductRepository) {}

  async execute(input: ListProductsInput): Promise<ListProductsResult> {
    const products = await this.repository.list({
      category: input.category,
      status: input.status ?? "published",
    });

    return {
      products: products.flatMap((product) => {
        const dto = toProductDto(product, input.locale);
        return dto ? [dto] : [];
      }),
    };
  }
}
