import type {Metadata} from "next";
import {describe, expect, it} from "vitest";

import {
  createAboutMetadata,
  createCategoryMetadata,
  createContactMetadata,
  createPrivacyMetadata,
  type CategoryRoute,
} from "@/app/[locale]/_site-metadata";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import type {Locale} from "@/shared/types/locale";

const messages = {
  en: enMessages,
  tr: trMessages,
  fa: faMessages,
  ar: arMessages,
} as const;

const categoryMessageKey = {
  "olive-oil": "oliveOil",
  food: "food",
  beverage: "beverage",
} as const;

const localeCases = ["en", "tr", "fa", "ar"] as const;
const categoryCases = ["olive-oil", "food", "beverage"] as const;

function expectLocalizedMetadata(
  metadata: Metadata,
  locale: Locale,
  pathname: string,
  title: string,
  description: string,
) {
  const localized = (candidate: Locale) =>
    `https://yolpol.com/${candidate}${pathname}`;
  expect(metadata).toMatchObject({
    title,
    description,
    alternates: {
      canonical: localized(locale),
      languages: {
        en: localized("en"),
        tr: localized("tr"),
        fa: localized("fa"),
        ar: localized("ar"),
        "x-default": localized("en"),
      },
    },
    openGraph: {title, description, url: localized(locale)},
  });
}

describe("actual localized static-route metadata", () => {
  it.each(
    categoryCases.flatMap((category) =>
      localeCases.map((locale) => [category, locale] as const),
    ),
  )("wires %s category metadata for %s", async (category, locale) => {
    const metadata = createCategoryMetadata(locale, category);
    const expected = messages[locale].CategoryPages[categoryMessageKey[category]];

    expectLocalizedMetadata(
      metadata,
      locale,
      `/products/${category}`,
      expected.metadata.title,
      expected.metadata.description,
    );
    expect(category as CategoryRoute).not.toBe("pharmaceutical");
  });

  it.each(localeCases)("wires About metadata for %s", async (locale) => {
    const metadata = createAboutMetadata(locale);
    const expected = messages[locale].About.metadata;
    expectLocalizedMetadata(
      metadata,
      locale,
      "/about",
      expected.title,
      expected.description,
    );
  });

  it.each(localeCases)("wires Contact metadata for %s", async (locale) => {
    const metadata = createContactMetadata(locale);
    const expected = messages[locale].Contact.metadata;
    expectLocalizedMetadata(
      metadata,
      locale,
      "/contact",
      expected.title,
      expected.description,
    );
  });

  it.each(localeCases)("wires Privacy metadata for %s", (locale) => {
    const metadata = createPrivacyMetadata(locale);
    const expected = messages[locale].PrivacyPage.metadata;
    expectLocalizedMetadata(metadata, locale, "/privacy", expected.title, expected.description);
  });
});
