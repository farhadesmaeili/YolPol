import {localizedAbsoluteUrl} from "@/shared/seo/metadata";
import type {Locale} from "@/shared/types/locale";

export function createBreadcrumbJsonLd({locale, items}: {locale: Locale; items: readonly Readonly<{name: string; pathname: string}>[]}) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({name, pathname}, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: localizedAbsoluteUrl(locale, pathname),
    })),
  } as const;
}
