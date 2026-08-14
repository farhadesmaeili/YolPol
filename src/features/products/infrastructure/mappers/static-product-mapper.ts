import {Product} from "@/features/products/domain/entities/product";
import type {
  ProductContentInputByLocale,
  ProductImageInput,
} from "@/features/products/domain/types/product-types";
import {ProductId} from "@/features/products/domain/value-objects/product-id";
import type {
  StaticLocalizedProductRecord,
  StaticTechnicalProductRecord,
} from "@/features/products/infrastructure/data/static-product-records";
import type {Locale} from "@/shared/types/locale";

export function toProductAggregate(
  record: StaticTechnicalProductRecord,
  localizedRecords: readonly StaticLocalizedProductRecord[],
): Product {
  const productId = ProductId.create(record.id).value;
  const matchingContent = localizedRecords.filter(
    (localizedRecord) =>
      ProductId.create(localizedRecord.productId).value === productId,
  );
  const content: Partial<
    Record<Locale, ProductContentInputByLocale[Locale]>
  > = {};

  for (const localizedRecord of matchingContent) {
    content[localizedRecord.locale] = {
      name: localizedRecord.name,
      shortDescription: localizedRecord.shortDescription,
      fullDescription: localizedRecord.fullDescription,
      applications: localizedRecord.applications,
      seoTitle: localizedRecord.seoTitle,
      seoDescription: localizedRecord.seoDescription,
    };
  }

  const images: ProductImageInput[] = record.images.map((image) => ({
    ...image,
    alternativeText: Object.fromEntries(
      matchingContent.flatMap((localizedRecord) => {
        const alternativeText = localizedRecord.imageAlternativeText?.[image.id];
        return alternativeText
          ? [[localizedRecord.locale, alternativeText] as const]
          : [];
      }),
    ),
  }));

  return Product.reconstitute({
    id: record.id,
    sku: record.sku,
    slug: record.slug,
    category: record.category,
    status: record.status,
    specifications: record.specifications,
    images,
    content,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  });
}
