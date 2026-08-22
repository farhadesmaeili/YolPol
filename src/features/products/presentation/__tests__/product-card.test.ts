import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { listProductCatalog } from "@/composition/products/product-catalog";
import { selectProductCardImage } from "@/features/products/presentation/components/product-card/product-card-image";
import type { ProductViewModel } from "@/features/products/presentation/view-models/product-view-model";
import { supportedLocales } from "@/shared/types/locale";

const cardFiles = [
  "src/features/products/presentation/components/product-card.tsx",
  "src/features/products/presentation/components/product-card/product-card-visual.tsx",
  "src/features/products/presentation/components/product-card/product-card-content.tsx",
  "src/features/products/presentation/components/product-card/product-card-actions.tsx",
  "src/features/products/presentation/components/product-card/product-card-image.ts",
];
const cardSource = cardFiles.map((file) => readFileSync(file, "utf8")).join("\n");

const image = (
  id: string,
  isPrimary: boolean,
): ProductViewModel["images"][number] => ({
  id,
  source: `/${id}.webp`,
  sortOrder: 1,
  isPrimary,
  alternativeText: `${id} alternative`,
});

describe("Product Card image policy", () => {
  it("prefers the primary image regardless of its position", () => {
    expect(selectProductCardImage([image("first", false), image("primary", true)])?.id).toBe("primary");
  });

  it("falls back to the first image only when no primary exists", () => {
    expect(selectProductCardImage([image("first", false), image("second", false)])?.id).toBe("first");
    expect(selectProductCardImage([])).toBeUndefined();
  });

  it("preserves canonical production image paths and localized alternatives", async () => {
    for (const locale of supportedLocales) {
      const catalog = await listProductCatalog(locale);
      expect(catalog.products).toHaveLength(9);
      for (const product of catalog.products) {
        const selected = selectProductCardImage(product.images);
        expect(selected?.source).toMatch(/^\/images\/products\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/u);
        expect(selected?.alternativeText).toBeTruthy();
      }
    }
  });
});

describe("Product Card presentation contract", () => {
  it("keeps every Card component server-rendered and view-model based", () => {
    expect(cardSource).not.toContain('"use client"');
    expect(cardSource).toContain('ProductViewModel["images"]');
    expect(cardSource).not.toMatch(/infrastructure|domain\/entities/u);
  });

  it("preserves localized content, category chips, and honest missing-image copy", () => {
    expect(cardSource).toContain("product.content.name");
    expect(cardSource).toContain("product.content.shortDescription");
    expect(cardSource).toContain("categoryLabels.map");
    expect(cardSource).toContain("missingImageLabel");
    expect(cardSource).toContain("image.alternativeText ?? productName");
  });

  it("keeps both actions Product-specific and limits inquiry data to the encoded ID", () => {
    expect(cardSource).toContain('href={`/products/${productSlug}`}');
    expect(cardSource).toContain('aria-label={`${viewLabel}: ${productName}`}');
    expect(cardSource).toContain('href={`/inquiry?product=${encodeURIComponent(productId)}`}');
    expect(cardSource).toContain('aria-label={`${inquiryLabel}: ${productName}`}');
    expect(cardSource).not.toMatch(/inquiry\?[^`]*?(?:sku|name|price|email|phone)=/iu);
  });

  it("uses subtle emerald styling without image zoom, sweep, or false status claims", () => {
    expect(cardSource).toContain("bg-emerald-900/[0.88]");
    expect(cardSource).not.toContain("bg-stone-950 text-white");
    expect(cardSource).not.toMatch(/group-hover[^"\n]*scale/u);
    expect(cardSource).not.toMatch(/sweep|EXPORT READY|\bACTIVE\b/u);
    expect(cardSource).not.toMatch(/\b(?:Offer|availability|rating|review|priceCurrency)\b/u);
    expect(cardSource).toContain("motion-reduce:animate-none");
    expect(cardSource).toContain("motion-reduce:transition-none");
  });

  it("keeps responsive images and mobile-safe actions", () => {
    expect(cardSource).toContain("object-contain");
    expect(cardSource).toContain('sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"');
    expect(cardSource).not.toContain("priority");
    expect(cardSource).toContain("grid-cols-1");
    expect(cardSource).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(cardSource).toContain("min-h-12");
  });

  it("keeps meaningful Card labels aligned in all locale catalogs", () => {
    const cardMessages = supportedLocales.map((locale) => {
      const messages = JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, "utf8")) as {
        Products: { card: Record<string, string> };
      };
      return messages.Products.card;
    });
    const keys = Object.keys(cardMessages[0]).sort();
    expect(keys).toEqual(["glassBottle", "inquiryPricing", "missingImage", "product"]);
    for (const messages of cardMessages) {
      expect(Object.keys(messages).sort()).toEqual(keys);
      expect(Object.values(messages).every((value) => value.trim().length > 0)).toBe(true);
    }
  });
});
