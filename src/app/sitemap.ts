import type {MetadataRoute} from "next";

import {getPathname} from "@/i18n/navigation";
import {routing} from "@/i18n/routing";
import {siteConfig} from "@/shared/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: new URL(getPathname({locale, href: "/"}), siteConfig.url).toString(),
    changeFrequency: "monthly",
    priority: locale === routing.defaultLocale ? 1 : 0.9,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((alternateLocale) => [
          alternateLocale,
          new URL(
            getPathname({locale: alternateLocale, href: "/"}),
            siteConfig.url,
          ).toString(),
        ]),
      ),
    },
  }));
}
