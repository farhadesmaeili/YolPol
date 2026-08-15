import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {absoluteUrl, localizedAbsoluteUrl} from "@/shared/seo/metadata";

export type ProductJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description: string;
  sku: string;
  category: readonly string[];
  color?: string;
  material?: string;
  additionalProperty?: readonly Readonly<{
    "@type": "PropertyValue";
    name: string;
    value: string;
  }>[];
  url: string;
  image?: readonly string[];
}>;

export function createProductJsonLd(input: {
  product: ProductViewModel;
  categoryNames: readonly string[];
  labels: Readonly<{
    capacity: string;
    milliliters: string;
    bottleShape: string;
    materialName?: string;
    colorName?: string;
    shapeName?: string;
  }>;
}): ProductJsonLd {
  const {product, categoryNames, labels} = input;
  const images = product.images
    .filter((image) => image.alternativeText)
    .map((image) => absoluteUrl(image.source));

  const properties = [
    product.specifications.capacityMl === undefined
      ? null
      : {
          "@type": "PropertyValue" as const,
          name: labels.capacity,
          value: `${product.specifications.capacityMl} ${labels.milliliters}`,
        },
    product.specifications.bottleShape === undefined || !labels.shapeName
      ? null
      : {
          "@type": "PropertyValue" as const,
          name: labels.bottleShape,
          value: labels.shapeName,
        },
  ].filter((property): property is NonNullable<typeof property> => property !== null);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.content.name,
    description: product.content.fullDescription,
    sku: product.identity.sku,
    category: categoryNames,
    url: localizedAbsoluteUrl(
      product.content.locale,
      `/products/${product.identity.slug}`,
    ),
    ...(images.length > 0 ? {image: images} : {}),
    ...(product.specifications.glassColor !== undefined && labels.colorName
      ? {color: labels.colorName}
      : {}),
    ...(labels.materialName ? {material: labels.materialName} : {}),
    ...(properties.length > 0 ? {additionalProperty: properties} : {}),
  };
}
