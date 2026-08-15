import {describe, expect, it} from "vitest";

import sitemap from "@/app/sitemap";
import {
  getProductCatalogItem,
  listPublishedProductRoutes,
} from "@/composition/products/product-catalog";
import {createProductJsonLd} from "@/features/products/presentation/seo/product-json-ld";
import {createProductDetailMetadata} from "@/features/products/presentation/seo/product-metadata";
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

describe("verified Product static routes", () => {
  it("creates 36 localized detail routes and 44 unique sitemap URLs", async () => {
    const routes = await listPublishedProductRoutes();
    expect(routes).toHaveLength(36);
    expect(new Set(routes.map(({locale, slug}) => `${locale}/${slug}`)).size).toBe(36);

    const entries = await sitemap();
    expect(entries).toHaveLength(44);
    expect(new Set(entries.map(({url}) => url)).size).toBe(44);
  });

  it("builds complete metadata and verified structured data for a real Product", async () => {
    const {detail, availableLocales} = await getProductCatalogItem(
      "250ml-olive-green-round-glass-bottle",
      "en",
    );
    expect(detail.status).toBe("ready");
    if (detail.status !== "ready") return;

    const metadata = createProductDetailMetadata({
      product: detail.product,
      availableLocales,
    });
    expect(metadata.alternates?.languages).toMatchObject({
      en: expect.stringContaining("/en/products/250ml-olive-green-round-glass-bottle"),
      tr: expect.stringContaining("/tr/products/250ml-olive-green-round-glass-bottle"),
      fa: expect.stringContaining("/fa/products/250ml-olive-green-round-glass-bottle"),
      ar: expect.stringContaining("/ar/products/250ml-olive-green-round-glass-bottle"),
      "x-default": expect.stringContaining("/en/products/250ml-olive-green-round-glass-bottle"),
    });

    const jsonLd = createProductJsonLd({
      product: detail.product,
      categoryNames: ["Olive oil bottles", "Food bottles", "Beverage bottles"],
      labels: {
        capacity: "Capacity",
        milliliters: "ml",
        bottleShape: "Bottle shape",
        materialName: "Glass",
        colorName: "Olive green",
        shapeName: "Round",
      },
    });
    expect(jsonLd).toMatchObject({
      sku: "YLP-GB-250-OG-RD",
      color: "Olive green",
      material: "Glass",
      category: ["Olive oil bottles", "Food bottles", "Beverage bottles"],
    });
    expect(jsonLd).not.toHaveProperty("offers");
  });

  it.each([
    ["en", "Glass"],
    ["tr", "Cam"],
    ["fa", "شیشه"],
    ["ar", "زجاج"],
  ] as const)("emits verified glass material in %s Product JSON-LD", async (locale, material) => {
    const {detail} = await getProductCatalogItem(
      "250ml-olive-green-round-glass-bottle",
      locale,
    );
    expect(detail.status).toBe("ready");
    if (detail.status !== "ready") return;

    const specifications = messagesByLocale[locale].ProductSpecifications;
    const categories = messagesByLocale[locale].ProductCategories;
    const jsonLd = createProductJsonLd({
      product: detail.product,
      categoryNames: [categories.oliveOil, categories.food, categories.beverage],
      labels: {
        capacity: specifications.capacity,
        milliliters: specifications.milliliters,
        bottleShape: specifications.bottleShape,
        materialName: specifications.materials.glass,
        colorName: specifications.glassColors.oliveGreen,
        shapeName: specifications.bottleShapes.round,
      },
    });

    expect(jsonLd.material).toBe(material);
    expect(jsonLd.additionalProperty).toEqual([
      {"@type": "PropertyValue", name: specifications.capacity, value: `250 ${specifications.milliliters}`},
      {"@type": "PropertyValue", name: specifications.bottleShape, value: specifications.bottleShapes.round},
    ]);
    for (const forbiddenField of [
      "offers",
      "price",
      "priceCurrency",
      "availability",
      "aggregateRating",
      "review",
    ]) {
      expect(jsonLd).not.toHaveProperty(forbiddenField);
    }
    expect(JSON.stringify(jsonLd)).not.toMatch(/180000|230000/);
    expect(detail.product.content.name).toContain(material);
  });
});
