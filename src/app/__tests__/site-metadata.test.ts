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
import {createLocalizedMetadata} from "@/shared/seo/metadata";
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
const homepageMetadata = {
  en: {
    title: "YolPol | Wholesale Goods Supplier in Iran",
    description: "YolPol supplies wholesale goods in Iran to domestic and international business buyers through price and availability inquiries.",
  },
  tr: {
    title: "YolPol | İran'da Toptan Mal Tedarikçisi",
    description: "YolPol, İran'da yerel ve uluslararası ticari alıcılara fiyat ve stok durumu sorgulamasına dayalı toptan mal tedariki sunar.",
  },
  fa: {
    title: "یول‌پل | تأمین‌کننده عمده کالا در ایران",
    description: "یول‌پل کالاهای عمده را در ایران برای خریداران تجاری داخلی و بین‌المللی، بر اساس استعلام قیمت و موجودی تأمین می‌کند.",
  },
  ar: {
    title: "YolPol | مورد للسلع بالجملة في إيران",
    description: "تورد YolPol السلع بالجملة في إيران للمشترين التجاريين المحليين والدوليين من خلال الاستعلام عن الأسعار ومدى التوفر.",
  },
} as const;

function expectLocalizedMetadata(
  metadata: Metadata,
  locale: Locale,
  pathname: string,
  title: string,
  description: string,
) {
  const localizedPathname = pathname === "/" ? "" : pathname;
  const localized = (candidate: Locale) =>
    `https://yolpol.com/${candidate}${localizedPathname}`;
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
  it.each(localeCases)("wires aligned homepage metadata for %s", (locale) => {
    const expected = homepageMetadata[locale];
    expect(messages[locale].Metadata).toEqual(expected);

    const metadata = createLocalizedMetadata({locale, ...expected});
    expectLocalizedMetadata(metadata, locale, "/", expected.title, expected.description);
  });

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
