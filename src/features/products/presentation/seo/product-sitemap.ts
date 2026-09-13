import type {MetadataRoute} from "next";

import {localizedAbsoluteUrl} from "@/shared/seo/metadata";
import {defaultLocale, supportedLocales, type Locale} from "@/shared/types/locale";

export type ProductSitemapRoute = Readonly<{locale: Locale; slug: string}>;

export function createProductSitemapEntries(
  routes: readonly ProductSitemapRoute[],
): MetadataRoute.Sitemap {
  const slugs = [...new Set(routes.map(({slug}) => slug))].sort();

  return slugs.flatMap((slug) => {
    const locales = supportedLocales.filter((locale) =>
      routes.some((route) => route.slug === slug && route.locale === locale),
    );
    const languages = Object.fromEntries(
      locales.map((locale) => [
        locale,
        localizedAbsoluteUrl(locale, `/products/${slug}`),
      ]),
    );

    return locales.map((locale) => ({
      url: localizedAbsoluteUrl(locale, `/products/${slug}`),
      changeFrequency: "monthly" as const,
      priority: locale === defaultLocale ? 0.8 : 0.7,
      alternates: {languages},
    }));
  });
}
