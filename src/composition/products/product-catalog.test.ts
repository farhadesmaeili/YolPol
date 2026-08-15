import {describe, expect, it} from "vitest";

import {createProductCatalogComposition} from "@/composition/products/product-catalog";
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
