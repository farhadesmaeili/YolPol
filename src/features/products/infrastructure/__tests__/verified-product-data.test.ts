import {describe, expect, it} from "vitest";
import {existsSync} from "node:fs";
import {join} from "node:path";

import {localizedProducts} from "@/features/products/infrastructure/data/localized-products";
import {technicalProducts} from "@/features/products/infrastructure/data/technical-products";
import {StaticProductRepository} from "@/features/products/infrastructure/repositories/static-product-repository";
import {supportedLocales} from "@/shared/types/locale";

const approvedProducts = [
  ["ylp-gb-250-og-rd", "YLP-GB-250-OG-RD", "250ml-olive-green-round-glass-bottle"],
  ["ylp-gb-250-og-sq", "YLP-GB-250-OG-SQ", "250ml-olive-green-square-glass-bottle"],
  ["ylp-gb-250-cl-rd", "YLP-GB-250-CL-RD", "250ml-clear-round-glass-bottle"],
  ["ylp-gb-250-cl-sq", "YLP-GB-250-CL-SQ", "250ml-clear-square-glass-bottle"],
  ["ylp-gb-500-og-rd", "YLP-GB-500-OG-RD", "500ml-olive-green-round-glass-bottle"],
  ["ylp-gb-500-og-sq", "YLP-GB-500-OG-SQ", "500ml-olive-green-square-glass-bottle"],
  ["ylp-gb-500-cl-rd", "YLP-GB-500-CL-RD", "500ml-clear-round-glass-bottle"],
  ["ylp-gb-500-cl-sq", "YLP-GB-500-CL-SQ", "500ml-clear-square-glass-bottle"],
  ["ylp-gb-700-og-rd", "YLP-GB-700-OG-RD", "700ml-olive-green-round-glass-bottle"],
] as const;

describe("verified Product dataset", () => {
  it("contains exactly the nine approved identity, SKU, slug, and image mappings", () => {
    expect(technicalProducts.map(({id, sku, slug}) => [id, sku, slug])).toEqual(
      approvedProducts,
    );
    for (const [id, , slug] of approvedProducts) {
      const product = technicalProducts.find((candidate) => candidate.id === id);
      expect(product?.images).toEqual([
        {
          id: `${id}-primary`,
          source: `/images/products/${slug}/01-primary.webp`,
          sortOrder: 0,
          isPrimary: true,
        },
      ]);
      expect(
        existsSync(join(process.cwd(), "public", `images/products/${slug}/01-primary.webp`)),
      ).toBe(true);
    }
  });

  it("publishes every Product in the three approved categories with inquiry pricing", () => {
    for (const product of technicalProducts) {
      expect(product.status).toBe("published");
      expect(product.categories).toEqual(["olive-oil", "food", "beverage"]);
      expect(product.categories).not.toContain("pharmaceutical");
      expect(product.pricing).toEqual({mode: "inquiry"});
      expect(JSON.stringify(product.pricing)).not.toMatch(/amount|currency|price/i);
    }
  });

  it("contains five verified packaging profiles and omits packaging for clear bottles", () => {
    expect(technicalProducts.filter(({packaging}) => packaging).map(({id}) => id)).toEqual([
      "ylp-gb-250-og-rd",
      "ylp-gb-250-og-sq",
      "ylp-gb-500-og-rd",
      "ylp-gb-500-og-sq",
      "ylp-gb-700-og-rd",
    ]);
    expect(
      technicalProducts
        .filter(({specifications}) => specifications.glassColor === "clear")
        .every(({packaging}) => packaging === undefined),
    ).toBe(true);
  });

  it("derives the five approved units-per-pallet values", async () => {
    const products = await new StaticProductRepository().list();
    expect(
      products.flatMap((product) =>
        product.packaging
          ? [[product.id.value, product.packaging.unitsPerPallet] as const]
          : [],
      ),
    ).toEqual([
      ["ylp-gb-250-og-rd", 4480],
      ["ylp-gb-250-og-sq", 4536],
      ["ylp-gb-500-og-rd", 2268],
      ["ylp-gb-500-og-sq", 2450],
      ["ylp-gb-700-og-rd", 1568],
    ]);
  });

  it("has one complete localized record and primary-image alt text per locale", () => {
    expect(localizedProducts).toHaveLength(36);
    for (const [id] of approvedProducts) {
      const records = localizedProducts.filter(({productId}) => productId === id);
      expect(records.map(({locale}) => locale)).toEqual(supportedLocales);
      for (const record of records) {
        expect(record.imageAlternativeText?.[`${id}-primary`]).toBeTruthy();
      }
    }
  });
});
