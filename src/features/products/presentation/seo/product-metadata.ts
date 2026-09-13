import type {Metadata} from "next";

import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {createLocalizedMetadata} from "@/shared/seo/metadata";
import type {Locale} from "@/shared/types/locale";

export function createProductListingMetadata(input: {
  locale: Locale;
  title: string;
  description: string;
}): Metadata {
  return createLocalizedMetadata({...input, pathname: "/products"});
}

export function createProductDetailMetadata(input: {
  product: ProductViewModel;
  availableLocales: readonly Locale[];
}): Metadata {
  const {product, availableLocales} = input;
  const primaryImage = product.images.find(
    (image) => image.isPrimary && image.alternativeText,
  );

  return createLocalizedMetadata({
    locale: product.content.locale,
    title: product.content.seo.title,
    description: product.content.seo.description,
    pathname: `/products/${product.identity.slug}`,
    alternateLocales: availableLocales,
    images: primaryImage ? [primaryImage.source] : undefined,
  });
}
