import {toProductDto} from "@/features/products/application/mappers/product-dto-mapper";
import type {ProductRepository} from "@/features/products/application/ports/product-repository";
import type {GetProductBySlugResult} from "@/features/products/application/results/product-query-results";
import {InvalidProductSlugError} from "@/features/products/domain/errors/product-errors";
import {ProductSlug} from "@/features/products/domain/value-objects/product-slug";
import type {Locale} from "@/shared/types/locale";

export class GetProductBySlug {
  constructor(private readonly repository: ProductRepository) {}

  async execute(input: {
    slug: string;
    locale: Locale;
  }): Promise<GetProductBySlugResult> {
    let slug: ProductSlug;

    try {
      slug = ProductSlug.create(input.slug);
    } catch (error) {
      if (error instanceof InvalidProductSlugError) {
        return {status: "not_found"};
      }
      throw error;
    }

    const product = await this.repository.findBySlug(slug);

    if (!product || product.status !== "published") {
      return {status: "not_found"};
    }

    const dto = toProductDto(product, input.locale);

    return dto
      ? {status: "found", product: dto}
      : {status: "locale_not_available"};
  }
}
