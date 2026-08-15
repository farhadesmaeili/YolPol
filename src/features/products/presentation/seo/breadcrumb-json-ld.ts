import {localizedAbsoluteUrl} from "@/shared/seo/metadata";
import type {Locale} from "@/shared/types/locale";

export type BreadcrumbJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: readonly Readonly<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>[];
}>;

export function createProductBreadcrumbJsonLd(input: {
  locale: Locale;
  slug: string;
  homeLabel: string;
  productsLabel: string;
  productLabel: string;
}): BreadcrumbJsonLd {
  const {locale, slug, homeLabel, productsLabel, productLabel} = input;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: homeLabel,
        item: localizedAbsoluteUrl(locale, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: productsLabel,
        item: localizedAbsoluteUrl(locale, "/products"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: productLabel,
        item: localizedAbsoluteUrl(locale, `/products/${slug}`),
      },
    ],
  };
}
