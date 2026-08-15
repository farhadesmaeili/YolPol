import type {ProductDto} from "@/features/products/application/dto/product-dto";
import type {Product} from "@/features/products/domain/entities/product";
import type {Locale} from "@/shared/types/locale";

export function toProductDto(product: Product, locale: Locale): ProductDto | null {
  const content = product.getContent(locale);

  if (!content) {
    return null;
  }

  return {
    id: product.id.value,
    sku: product.sku.value,
    slug: product.slug.value,
    categories: [...product.categories],
    status: product.status,
    locale,
    name: content.name.value,
    shortDescription: content.shortDescription,
    fullDescription: content.fullDescription,
    applications: [...content.applications],
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    specifications: {...product.specifications},
    packaging: product.packaging ? {...product.packaging} : undefined,
    pricing: {...product.pricing},
    images: product.images.map((image) => ({
      id: image.id,
      source: image.source,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
      alternativeText: image.alternativeText?.[locale],
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
