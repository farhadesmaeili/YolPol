import type {Metadata} from "next";

import type {ProductCategory} from "@/features/products/domain/types/product-types";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import {createLocalizedMetadata} from "@/shared/seo/metadata";
import type {Locale} from "@/shared/types/locale";

export type CategoryRoute = Extract<
  ProductCategory,
  "olive-oil" | "food" | "beverage"
>;

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

export function createCategoryMetadata(
  locale: Locale,
  category: CategoryRoute,
): Metadata {
  const metadata =
    messages[locale].CategoryPages[categoryMessageKey[category]].metadata;
  return createLocalizedMetadata({
    locale,
    title: metadata.title,
    description: metadata.description,
    pathname: `/products/${category}`,
  });
}

export function createAboutMetadata(locale: Locale): Metadata {
  const metadata = messages[locale].About.metadata;
  return createLocalizedMetadata({
    locale,
    title: metadata.title,
    description: metadata.description,
    pathname: "/about",
  });
}

export function createContactMetadata(locale: Locale): Metadata {
  const metadata = messages[locale].Contact.metadata;
  return createLocalizedMetadata({
    locale,
    title: metadata.title,
    description: metadata.description,
    pathname: "/contact",
  });
}

export function createPrivacyMetadata(locale: Locale): Metadata {
  const metadata = messages[locale].PrivacyPage.metadata;
  return createLocalizedMetadata({
    locale,
    title: metadata.title,
    description: metadata.description,
    pathname: "/privacy",
  });
}
