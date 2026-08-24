import type {Metadata} from "next";

import {routing, type Locale} from "@/i18n/routing";
import {siteConfig} from "@/shared/config/site";

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteConfig.url).toString();
}

export function localizedAbsoluteUrl(locale: Locale, pathname: string): string {
  const normalizedPathname = pathname === "/" ? "" : pathname;
  return absoluteUrl(`/${locale}${normalizedPathname}`);
}

export function createLocalizedMetadata({
  locale,
  title,
  description,
  pathname = "/",
  alternateLocales = routing.locales,
  images,
}: {
  locale: Locale;
  title: string;
  description: string;
  pathname?: string;
  alternateLocales?: readonly Locale[];
  images?: readonly string[];
}): Metadata {
  const languages = Object.fromEntries(
    alternateLocales.map((alternateLocale) => [
      alternateLocale,
      localizedAbsoluteUrl(alternateLocale, pathname),
    ]),
  );
  const canonical = localizedAbsoluteUrl(locale, pathname);
  const xDefaultLocale = alternateLocales.includes(routing.defaultLocale)
    ? routing.defaultLocale
    : (alternateLocales[0] ?? locale);

  return {
    metadataBase: new URL(siteConfig.url),
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ...languages,
        "x-default": localizedAbsoluteUrl(xDefaultLocale, pathname),
      },
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.identity.publicName,
      locale,
      url: canonical,
      title,
      description,
      images: images?.map((image) => absoluteUrl(image)),
    },
  };
}
