import type {MetadataRoute} from "next";

import {listPublishedProductRoutes} from "@/composition/products/product-catalog";
import {createProductSitemapEntries} from "@/features/products/presentation/seo/product-sitemap";
import {routing} from "@/i18n/routing";
import {localizedAbsoluteUrl} from "@/shared/seo/metadata";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ["/", "/products"];
  const staticEntries = staticPaths.flatMap((pathname, pathIndex) => {
    const languages = Object.fromEntries(
      routing.locales.map((locale) => [
        locale,
        localizedAbsoluteUrl(locale, pathname),
      ]),
    );
    return routing.locales.map((locale) => ({
      url: localizedAbsoluteUrl(locale, pathname),
      changeFrequency: "monthly" as const,
      priority: pathIndex === 0 ? (locale === routing.defaultLocale ? 1 : 0.9) : 0.8,
      alternates: {languages},
    }));
  });
  const productRoutes = await listPublishedProductRoutes();
  return [...staticEntries, ...createProductSitemapEntries(productRoutes)];
}
