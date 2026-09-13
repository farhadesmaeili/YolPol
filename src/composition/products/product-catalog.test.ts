import {describe, expect, it} from "vitest";

import {createProductCatalogComposition, findProductDtoById} from "@/composition/products/product-catalog";
import type {ProductCategory} from "@/features/products/domain/types/product-types";
import {ProductTestBuilder} from "@/features/products/testing/builders/product-test-builder";
import {FakeProductRepository} from "@/features/products/testing/fakes/fake-product-repository";

function product(
  category: ProductCategory,
  status: "published" | "draft",
  index: number,
) {
  return new ProductTestBuilder()
    .with({
      id: `composition-${category}-${status}-${index}`,
      sku: `COMP-${category}-${status}-${index}`.toUpperCase(),
      slug: `composition-${category}-${status}-${index}`,
      categories: [category],
      status,
    })
    .buildReconstituted();
}

describe("Product catalog composition", () => {
  it("distinguishes malformed and missing Product identifiers without exposing errors", async () => {
    await expect(findProductDtoById("not a valid id", "en")).resolves.toEqual({status: "invalid_product_id"});
    await expect(findProductDtoById(" valid-id ", "en")).resolves.toEqual({status: "invalid_product_id"});
    await expect(findProductDtoById("valid-but-absent", "en")).resolves.toEqual({status: "missing"});
  });

  it("preserves a successful Product lookup", async () => {
    await expect(findProductDtoById("ylp-gb-250-og-rd", "en")).resolves.toMatchObject({status: "found", product: {id: "ylp-gb-250-og-rd", status: "published", locale: "en"}});
  });

  it.each(["olive-oil", "food", "beverage"] as const)(
    "forwards the %s category with the published-only policy",
    async (category) => {
      const repository = new FakeProductRepository([
        product("olive-oil", "published", 1),
        product("food", "published", 2),
        product("beverage", "published", 3),
        product(category, "draft", 4),
      ]);
      const composition = createProductCatalogComposition(repository);

      const result = await composition.listProductCatalog("en", {category});

      expect(result.products).toHaveLength(1);
      expect(result.products[0]).toMatchObject({
        categories: [category],
        status: "published",
      });
      expect(repository.listQueries).toEqual([
        {category, status: "published"},
      ]);
    },
  );
});
