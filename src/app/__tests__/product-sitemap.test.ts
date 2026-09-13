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
import {routing} from "@/i18n/routing";
import {localizedAbsoluteUrl} from "@/shared/seo/metadata";

const messagesByLocale = {
  en: enMessages,
  tr: trMessages,
  fa: faMessages,
  ar: arMessages,
} as const;

describe("verified Product static routes", () => {
  it("creates 36 localized detail routes and 76 unique sitemap URLs", async () => {
    const routes = await listPublishedProductRoutes();
    expect(routes).toHaveLength(36);
    expect(new Set(routes.map(({locale, slug}) => `${locale}/${slug}`)).size).toBe(36);

    const entries = await sitemap();
    const urls = new Set(entries.map(({url}) => url));
    const expectedProductUrls = routes.map(({locale, slug}) =>
      localizedAbsoluteUrl(locale, `/products/${slug}`),
    );
    const staticPaths = [
      "/",
      "/products",
      "/products/olive-oil",
      "/products/food",
      "/products/beverage",
      "/about",
      "/contact",
      "/wholesale-process",
      "/inquiry",
      "/privacy",
    ] as const;
    const expectedStaticUrls = staticPaths.flatMap((pathname) =>
      routing.locales.map((locale) => localizedAbsoluteUrl(locale, pathname)),
    );

    expect(entries).toHaveLength(76);
    expect(urls.size).toBe(76);
    expect(entries.filter(({url}) => url.endsWith("/inquiry"))).toHaveLength(4);
    expect(entries.filter(({url}) => url.endsWith("/privacy"))).toHaveLength(4);
    expect(entries.filter(({url}) => url.endsWith("/wholesale-process"))).toHaveLength(4);
    expect(entries.some(({url}) => url.endsWith("/export-logistics"))).toBe(false);
    expect(urls).toEqual(new Set([...expectedStaticUrls, ...expectedProductUrls]));
    expect(expectedProductUrls).toHaveLength(36);
    expect(
      entries.filter(({url}) =>
        /\/products\/(?:olive-oil|food|beverage)$/.test(url),
      ),
    ).toHaveLength(12);
    expect(entries.some(({url}) => url.includes("/products/pharmaceutical"))).toBe(
      false,
    );
    for (const entry of entries) {
      expect(entry.alternates?.languages).toMatchObject({
        en: expect.stringContaining("/en"),
        tr: expect.stringContaining("/tr"),
        fa: expect.stringContaining("/fa"),
        ar: expect.stringContaining("/ar"),
      });
    }
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
