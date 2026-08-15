import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {absoluteUrl, localizedAbsoluteUrl} from "@/shared/seo/metadata";

export type ProductJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description: string;
  sku: string;
  category: string;
  url: string;
  image?: readonly string[];
}>;

export function createProductJsonLd(input: {
  product: ProductViewModel;
  categoryName: string;
}): ProductJsonLd {
  const {product, categoryName} = input;
  const images = product.images
    .filter((image) => image.alternativeText)
    .map((image) => absoluteUrl(image.source));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.content.name,
    description: product.content.fullDescription,
    sku: product.identity.sku,
    category: categoryName,
    url: localizedAbsoluteUrl(
      product.content.locale,
      `/products/${product.identity.slug}`,
    ),
    ...(images.length > 0 ? {image: images} : {}),
  };
}
