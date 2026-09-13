import {describe, expect, it} from "vitest";
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
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

const approvedCommercialData = [
  ["ylp-gb-250-og-rd", 180_000, 70, 64, 4_480, 925, 116_480],
  ["ylp-gb-250-og-sq", 180_000, 56, 81, 4_536, 960, 117_936],
  ["ylp-gb-250-cl-rd", 180_000, 70, 64, 4_480, 925, 116_480],
  ["ylp-gb-250-cl-sq", 180_000, 56, 81, 4_536, 960, 117_936],
  ["ylp-gb-500-og-rd", 230_000, 36, 63, 2_268, 790, 58_968],
  ["ylp-gb-500-og-sq", 230_000, 35, 70, 2_450, 815, 63_700],
  ["ylp-gb-500-cl-rd", 230_000, 36, 63, 2_268, 790, 58_968],
  ["ylp-gb-500-cl-sq", 230_000, 35, 70, 2_450, 815, 63_700],
  ["ylp-gb-700-og-rd", 350_000, 28, 56, 1_568, 700, 40_768],
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

  it("keeps every approved primary image nonempty, WebP-encoded, and content-unique", () => {
    const hashes = technicalProducts.map(({images}) => {
      expect(images).toHaveLength(1);
      const image = images[0];
      if (!image) throw new Error("Expected one primary Product image");
      expect(image.isPrimary).toBe(true);
      expect(image.source.endsWith("/01-primary.webp")).toBe(true);
      const bytes = readFileSync(join(process.cwd(), "public", image.source));
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      return createHash("sha256").update(bytes).digest("hex");
    });

    expect(new Set(hashes).size).toBe(approvedProducts.length);
  });

  it("publishes every Product with the exact approved internal price and packaging", async () => {
    const products = await new StaticProductRepository().list();
    expect(products).toHaveLength(9);
    for (const [id, price, unitsPerPackage, packagesPerPallet, unitsPerPallet, weightKg, unitsPerTruck] of approvedCommercialData) {
      const product = products.find((candidate) => candidate.id.value === id);
      if (!product) throw new Error(`Missing approved Product ${id}`);
      expect(product.status).toBe("published");
      expect(product.categories).toEqual(["olive-oil", "food", "beverage"]);
      expect(product.categories).not.toContain("pharmaceutical");
      expect(product.pricing).toEqual({
        mode: "inquiry",
        internalUnitPrice: {amount: price, currency: "IRR"},
      });
      expect(product.packaging).toEqual({
        unitsPerPackage,
        packagesPerPallet,
        unitsPerPallet,
        palletGrossWeightKg: weightKg,
      });
      expect(unitsPerPackage * packagesPerPallet).toBe(unitsPerPallet);
      expect(unitsPerPallet * 26).toBe(unitsPerTruck);
      expect(Number.isSafeInteger(weightKg * 1_000)).toBe(true);
    }
  });

  it("maps every clear Product to its exact olive-green packaging counterpart", () => {
    for (const [clearId, oliveId] of [
      ["ylp-gb-250-cl-rd", "ylp-gb-250-og-rd"],
      ["ylp-gb-250-cl-sq", "ylp-gb-250-og-sq"],
      ["ylp-gb-500-cl-rd", "ylp-gb-500-og-rd"],
      ["ylp-gb-500-cl-sq", "ylp-gb-500-og-sq"],
    ] as const) {
      expect(technicalProducts.find(({id}) => id === clearId)?.packaging).toEqual(
        technicalProducts.find(({id}) => id === oliveId)?.packaging,
      );
    }
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
