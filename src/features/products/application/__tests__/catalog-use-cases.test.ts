import {describe, expect, it} from "vitest";

import {GetProductBySlug} from "@/features/products/application/use-cases/get-product-by-slug";
import {ListProducts} from "@/features/products/application/use-cases/list-products";
import {ProductTestBuilder} from "@/features/products/testing/builders/product-test-builder";
import {FakeProductRepository} from "@/features/products/testing/fakes/fake-product-repository";

function createRepository() {
  return new FakeProductRepository([
    new ProductTestBuilder()
      .with({
        id: "published-1",
        sku: "TEST-PUB-1",
        slug: "published-product",
        category: "beverage",
        status: "published",
      })
      .buildReconstituted(),
    new ProductTestBuilder()
      .with({
        id: "draft-1",
        sku: "TEST-DRA-1",
        slug: "draft-product",
        category: "pharmaceutical",
        status: "draft",
      })
      .buildReconstituted(),
    new ProductTestBuilder()
      .with({
        id: "archived-1",
        sku: "TEST-ARC-1",
        slug: "archived-product",
        category: "beverage",
        status: "archived",
      })
      .buildReconstituted(),
  ]);
}

describe("GetProductBySlug", () => {
  it("returns a localized application DTO", async () => {
    const useCase = new GetProductBySlug(createRepository());
    const result = await useCase.execute({slug: "published-product", locale: "en"});
    expect(result).toMatchObject({
      status: "found",
      product: {id: "published-1", locale: "en", name: "Test Bottle"},
    });
  });

  it("returns explicit missing and locale-unavailable results", async () => {
    const useCase = new GetProductBySlug(createRepository());
    await expect(
      useCase.execute({slug: "missing-product", locale: "en"}),
    ).resolves.toEqual({status: "not_found"});
    await expect(
      useCase.execute({slug: "published-product", locale: "fa"}),
    ).resolves.toEqual({status: "locale_not_available"});
  });
});

describe("ListProducts", () => {
  it("fails closed to published products by default", async () => {
    const repository = createRepository();
    const result = await new ListProducts(repository).execute({locale: "en"});
    expect(result.products.map((product) => product.slug)).toEqual([
      "published-product",
    ]);
    expect(repository.listQueries).toEqual([{status: "published"}]);
  });

  it("allows explicit draft and archived listings", async () => {
    const useCase = new ListProducts(createRepository());
    const drafts = await useCase.execute({locale: "en", status: "draft"});
    const archived = await useCase.execute({locale: "en", status: "archived"});
    expect(drafts.products.map((product) => product.slug)).toEqual(["draft-product"]);
    expect(archived.products.map((product) => product.slug)).toEqual([
      "archived-product",
    ]);
  });

  it("composes category with the effective status filter", async () => {
    const repository = createRepository();
    const result = await new ListProducts(repository).execute({
      locale: "en",
      category: "pharmaceutical",
      status: "draft",
    });
    expect(result.products.map((product) => product.slug)).toEqual(["draft-product"]);
    expect(repository.listQueries).toEqual([
      {category: "pharmaceutical", status: "draft"},
    ]);
  });

  it("does not expose products without the requested locale", async () => {
    const result = await new ListProducts(createRepository()).execute({locale: "tr"});
    expect(result.products).toEqual([]);
  });
});
