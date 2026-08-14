import {describe, expect, it} from "vitest";

import {ProductId} from "@/features/products/domain/value-objects/product-id";
import {ProductSlug} from "@/features/products/domain/value-objects/product-slug";
import {
  DuplicateStaticLocalizedRecordError,
  DuplicateStaticProductIdError,
  DuplicateStaticProductSkuError,
  DuplicateStaticProductSlugError,
  MissingStaticLocalizedContentError,
  OrphanStaticLocalizedRecordError,
} from "@/features/products/infrastructure/errors/static-product-data-errors";
import {StaticProductRepository} from "@/features/products/infrastructure/repositories/static-product-repository";
import {
  createLocalizedProductRecords,
  createTechnicalProductRecords,
} from "@/features/products/testing/fixtures/product-fixtures";

function createRepository() {
  return new StaticProductRepository(
    createTechnicalProductRecords(),
    createLocalizedProductRecords(),
  );
}

describe("StaticProductRepository integrity", () => {
  it("accepts an empty production dataset", async () => {
    const repository = new StaticProductRepository();
    await expect(repository.list()).resolves.toEqual([]);
  });

  it.each([
    [
      "IDs",
      DuplicateStaticProductIdError,
      (records: ReturnType<typeof createTechnicalProductRecords>) => ({
        ...records[1],
        id: records[0].id,
      }),
    ],
    [
      "SKUs",
      DuplicateStaticProductSkuError,
      (records: ReturnType<typeof createTechnicalProductRecords>) => ({
        ...records[1],
        sku: records[0].sku.toLowerCase(),
      }),
    ],
    [
      "global slugs",
      DuplicateStaticProductSlugError,
      (records: ReturnType<typeof createTechnicalProductRecords>) => ({
        ...records[1],
        slug: records[0].slug,
      }),
    ],
  ] as const)("rejects duplicate %s", (_label, ErrorType, duplicateRecord) => {
    const records = createTechnicalProductRecords();
    records[1] = duplicateRecord(records);
    expect(() =>
      new StaticProductRepository(records, createLocalizedProductRecords()),
    ).toThrow(ErrorType);
  });

  it("rejects duplicate product-locale records", () => {
    const localizedRecords = createLocalizedProductRecords();
    localizedRecords.push({...localizedRecords[0]});
    expect(() =>
      new StaticProductRepository(createTechnicalProductRecords(), localizedRecords),
    ).toThrow(DuplicateStaticLocalizedRecordError);
  });

  it("rejects localized records without a technical product", () => {
    const localizedRecords = createLocalizedProductRecords();
    localizedRecords.push({...localizedRecords[0], productId: "missing-product"});
    expect(() =>
      new StaticProductRepository(createTechnicalProductRecords(), localizedRecords),
    ).toThrow(OrphanStaticLocalizedRecordError);
  });

  it("rejects technical products without localized content", () => {
    const localizedRecords = createLocalizedProductRecords().filter(
      (record) => record.productId !== "pharma-1",
    );
    expect(() =>
      new StaticProductRepository(createTechnicalProductRecords(), localizedRecords),
    ).toThrow(MissingStaticLocalizedContentError);
  });
});

describe("StaticProductRepository behavior", () => {
  it("finds products by ID and global slug", async () => {
    const repository = createRepository();
    const byId = await repository.findById(ProductId.create("beverage-1"));
    const bySlug = await repository.findBySlug(
      ProductSlug.create("beverage-fixture"),
    );
    expect(byId?.sku.value).toBe("TEST-BEV-1");
    expect(bySlug?.id.value).toBe("beverage-1");
  });

  it("returns null for missing products", async () => {
    const repository = createRepository();
    await expect(repository.findById(ProductId.create("missing"))).resolves.toBeNull();
    await expect(
      repository.findBySlug(ProductSlug.create("missing-product")),
    ).resolves.toBeNull();
  });

  it("composes category and status filters and preserves source ordering", async () => {
    const repository = createRepository();
    const results = await repository.list({category: "beverage", status: "archived"});
    expect(results.map((product) => product.slug.value)).toEqual([
      "archived-fixture",
    ]);
  });

  it("hydrates independent aggregates for every result", async () => {
    const repository = createRepository();
    const first = await repository.findBySlug(ProductSlug.create("pharma-fixture"));
    const second = await repository.findBySlug(ProductSlug.create("pharma-fixture"));

    expect(first).not.toBe(second);
    first?.transitionTo("archived", new Date("2026-01-03T00:00:00.000Z"));

    expect(first?.status).toBe("archived");
    expect(second?.status).toBe("draft");
    await expect(
      repository.findBySlug(ProductSlug.create("pharma-fixture")),
    ).resolves.toMatchObject({status: "draft"});
  });

  it("returns deterministic results across repeated calls", async () => {
    const repository = createRepository();
    const first = await repository.list();
    const second = await repository.list();
    expect(first.map((product) => product.slug.value)).toEqual(
      second.map((product) => product.slug.value),
    );
    expect(first.every((product, index) => product !== second[index])).toBe(true);
  });

  it("isolates stored snapshots from constructor input mutation", async () => {
    const technicalRecords = createTechnicalProductRecords();
    const localizedRecords = createLocalizedProductRecords();
    const repository = new StaticProductRepository(technicalRecords, localizedRecords);

    Reflect.set(technicalRecords[0], "status", "draft");
    Reflect.set(technicalRecords[0].specifications, "capacityMl", 999);
    Reflect.set(localizedRecords[0], "name", "Changed name");
    technicalRecords.push({...technicalRecords[0], id: "later-product"});

    const product = await repository.findBySlug(
      ProductSlug.create("beverage-fixture"),
    );
    expect(product?.status).toBe("published");
    expect(product?.specifications.capacityMl).toBe(330);
    expect(product?.getContent("en")?.name.value).toBe("Beverage Test Bottle");
    await expect(repository.list()).resolves.toHaveLength(3);
  });
});
