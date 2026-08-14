import type {Metadata} from "next";

import {getPathname} from "@/i18n/navigation";
import {routing, type Locale} from "@/i18n/routing";
import {siteConfig} from "@/shared/config/site";

function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteConfig.url).toString();
}

export function createLocalizedMetadata({
  locale,
  title,
  description,
}: {
  locale: Locale;
  title: string;
  description: string;
}): Metadata {
  const languages = Object.fromEntries(
    routing.locales.map((alternateLocale) => [
      alternateLocale,
      absoluteUrl(getPathname({locale: alternateLocale, href: "/"})),
    ]),
  );
  const canonical = absoluteUrl(getPathname({locale, href: "/"}));

  return {
    metadataBase: new URL(siteConfig.url),
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ...languages,
        "x-default": absoluteUrl(
          getPathname({locale: routing.defaultLocale, href: "/"}),
        ),
      },
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale,
      url: canonical,
      title,
      description,
    },
  };
}
