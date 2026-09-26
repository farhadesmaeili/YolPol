import type {MetadataRoute} from "next";

import {listPublishedProductRoutes} from "@/composition/products/product-catalog";
import {createProductSitemapEntries} from "@/features/products/presentation/seo/product-sitemap";
import {routing} from "@/i18n/routing";
import {localizedAbsoluteUrl} from "@/shared/seo/metadata";

export const publicStaticIndexablePaths = Object.freeze([
  "/",
  "/products",
  "/products/olive-oil",
  "/products/food",
  "/products/beverage",
  "/about",
  "/contact",
  "/wholesale-process",
  "/inquiry",
  "/privacy",
] as const);

export async function listPublicIndexableSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = publicStaticIndexablePaths.flatMap((pathname, pathIndex) => {
    const languages = Object.fromEntries(
      routing.locales.map((locale) => [locale, localizedAbsoluteUrl(locale, pathname)]),
    );

    return routing.locales.map((locale) => ({
      url: localizedAbsoluteUrl(locale, pathname),
      changeFrequency: "monthly" as const,
      priority: pathIndex === 0 ? (locale === routing.defaultLocale ? 1 : 0.9) : pathIndex === 1 ? 0.8 : 0.7,
      alternates: {languages},
    }));
  });
  const productRoutes = await listPublishedProductRoutes();

  return [...staticEntries, ...createProductSitemapEntries(productRoutes)];
}

export async function listCanonicalIndexableUrls(): Promise<readonly string[]> {
  return (await listPublicIndexableSitemapEntries()).map(({url}) => url);
}
