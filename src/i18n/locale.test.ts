import {describe, expect, it} from "vitest";

import {getLocaleDirection, isLocale} from "@/i18n/locale";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";

const messagesByLocale = {
  en: enMessages,
  tr: trMessages,
  fa: faMessages,
  ar: arMessages,
} as const;

function messageKeyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    messageKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale configuration", () => {
  it.each([
    ["en", "ltr"],
    ["tr", "ltr"],
    ["fa", "rtl"],
    ["ar", "rtl"],
  ] as const)("uses the correct direction for %s", (locale, direction) => {
    expect(getLocaleDirection(locale)).toBe(direction);
  });

  it("rejects unsupported locale identifiers", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("keeps identical message key paths in every locale", () => {
    const englishKeys = messageKeyPaths(enMessages).sort();
    for (const messages of Object.values(messagesByLocale)) {
      expect(messageKeyPaths(messages).sort()).toEqual(englishKeys);
    }
  });

  it("contains localized shell, category, About, and Contact messages", () => {
    for (const messages of Object.values(messagesByLocale)) {
      expect(messages.SiteShell.navigation).toHaveProperty("olive-oil");
      expect(messages.CategoryPages).toHaveProperty("beverage.metadata.title");
      expect(messages.About).toHaveProperty("metadata.description");
      expect(messages.Contact).toHaveProperty("metadata.description");
    }
  });

  it.each([
    ["en", "Glass Bottles for Olive Oil, Food and Beverages", "pharmaceutical"],
    ["tr", "Zeytinyağı, Gıda ve İçecekler için Cam Şişeler", "ilaç"],
    ["fa", "بطری‌های شیشه‌ای برای روغن زیتون، مواد غذایی و نوشیدنی‌ها", "دارویی"],
    ["ar", "زجاجات زجاجية لزيت الزيتون والأغذية والمشروبات", "الأدوية"],
  ] as const)("describes only assigned catalog applications in %s", (locale, heading, excludedTerm) => {
    const messages = messagesByLocale[locale];
    expect(messages.Products.heading).toBe(heading);
    expect(
      `${messages.HomePage.heading} ${messages.Metadata.description} ${messages.Products.heading} ${messages.Products.description} ${messages.Products.metadata.title} ${messages.Products.metadata.description}`.toLocaleLowerCase(
        locale,
      ),
    ).not.toContain(excludedTerm);
    expect(messages.ProductCategories.pharmaceutical).toBeTruthy();
  });
});
