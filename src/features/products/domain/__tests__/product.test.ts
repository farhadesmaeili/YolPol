import {describe, expect, it} from "vitest";

import {Product} from "@/features/products/domain/entities/product";
import {
  InvalidProductIdError,
  InvalidProductImageError,
  InvalidProductCategoryError,
  InvalidProductPackagingError,
  InvalidProductStatusTransitionError,
  InvalidProductTimestampError,
  InvalidTechnicalSpecificationError,
  ProductPublicationError,
} from "@/features/products/domain/errors/product-errors";
import {ProductTestBuilder} from "@/features/products/testing/builders/product-test-builder";

describe("Product lifecycle", () => {
  it("creates new products as drafts", () => {
    expect(new ProductTestBuilder().with({status: "archived"}).buildNew().status).toBe(
      "draft",
    );
  });

  it("rejects forged value-object-shaped input at the aggregate boundary", () => {
    expect(() =>
      Reflect.apply(Product.create, Product, [
        {
          id: {value: "product-1"},
          sku: "TEST-001",
          slug: "test-product",
          categories: ["beverage"],
          specifications: {},
          pricing: {mode: "inquiry"},
          images: [],
          content: {
            en: {
              name: "Test Product",
              shortDescription: "Summary",
              fullDescription: "Description",
              applications: ["Testing"],
              seoTitle: "Test Product",
              seoDescription: "SEO description",
            },
          },
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]),
    ).toThrow(InvalidProductIdError);
  });

  it("reconstitutes valid published and archived products", () => {
    expect(
      new ProductTestBuilder().with({status: "published"}).buildReconstituted().status,
    ).toBe("published");
    expect(
      new ProductTestBuilder().with({status: "archived"}).buildReconstituted().status,
    ).toBe("archived");
  });

  it("rejects invalid persisted publication state", () => {
    expect(() =>
      new ProductTestBuilder()
        .with({status: "published", images: []})
        .buildReconstituted(),
    ).toThrow(ProductPublicationError);
  });

  it("supports draft to published, published to archived, and archived to draft", () => {
    const product = new ProductTestBuilder().buildNew();
    product.transitionTo("published", new Date("2026-01-02T00:00:00.000Z"));
    product.transitionTo("archived", new Date("2026-01-03T00:00:00.000Z"));
    product.transitionTo("draft", new Date("2026-01-04T00:00:00.000Z"));
    expect(product.status).toBe("draft");
  });

  it("supports an explicit draft to archived transition", () => {
    const product = new ProductTestBuilder().buildNew();
    product.transitionTo("archived", new Date("2026-01-02T00:00:00.000Z"));
    expect(product.status).toBe("archived");
  });

  it.each([
    ["published", "draft"],
    ["archived", "published"],
  ] as const)("rejects %s to %s", (from, to) => {
    const product = new ProductTestBuilder().with({status: from}).buildReconstituted();
    expect(() =>
      product.transitionTo(to, new Date("2026-01-03T00:00:00.000Z")),
    ).toThrow(InvalidProductStatusTransitionError);
  });

  it("rejects creation and transition timestamps that move backwards", () => {
    expect(() =>
      new ProductTestBuilder()
        .with({createdAt: new Date("invalid")})
        .buildReconstituted(),
    ).toThrow(InvalidProductTimestampError);
    expect(() =>
      new ProductTestBuilder()
        .with({updatedAt: new Date("2025-12-31T00:00:00.000Z")})
        .buildReconstituted(),
    ).toThrow(InvalidProductTimestampError);

    const product = new ProductTestBuilder().buildReconstituted();
    expect(() =>
      product.transitionTo("archived", new Date("2026-01-01T12:00:00.000Z")),
    ).toThrow(InvalidProductTimestampError);
  });

  it("keeps same-status transitions as timestamp-preserving no-ops", () => {
    const product = new ProductTestBuilder().buildReconstituted();
    const previousUpdatedAt = product.updatedAt;
    product.transitionTo("draft", new Date("2020-01-01T00:00:00.000Z"));
    expect(product.updatedAt).toEqual(previousUpdatedAt);
  });
});

describe("Product data invariants", () => {
  it.each([
    ["capacityMl", 0],
    ["weightGrams", -1],
    ["heightMm", Number.NaN],
    ["diameterMm", Number.POSITIVE_INFINITY],
    ["glassColor", "amber"],
    ["bottleShape", "oval"],
    ["neckFinish", ""],
  ] as const)("rejects invalid %s", (field, value) => {
    expect(() =>
      new ProductTestBuilder()
        .with({specifications: {[field]: value}})
        .buildReconstituted(),
    ).toThrow(InvalidTechnicalSpecificationError);
  });

  it("supports immutable unique categories and rejects duplicates", () => {
    const categories: ("olive-oil" | "food" | "beverage" | "pharmaceutical")[] = [
      "olive-oil",
      "food",
      "beverage",
    ];
    const product = new ProductTestBuilder().with({categories}).buildReconstituted();
    expect(product.categories).toEqual(categories);
    expect(Object.isFrozen(product.categories)).toBe(true);
    categories[0] = "pharmaceutical";
    expect(product.categories).toEqual(["olive-oil", "food", "beverage"]);
    expect(() =>
      new ProductTestBuilder()
        .with({categories: ["food", "food"]})
        .buildReconstituted(),
    ).toThrow(InvalidProductCategoryError);
  });

  it("requires at least one category for publication", () => {
    expect(() =>
      new ProductTestBuilder()
        .with({status: "published", categories: []})
        .buildReconstituted(),
    ).toThrow(InvalidProductCategoryError);
  });

  it("validates packaging and derives immutable units per pallet", () => {
    const packaging = {
      unitsPerPackage: 70,
      packagesPerPallet: 64,
      palletGrossWeightKg: 925,
    };
    const product = new ProductTestBuilder().with({packaging}).buildReconstituted();
    expect(product.packaging).toEqual({...packaging, unitsPerPallet: 4480});
    expect(Object.isFrozen(product.packaging)).toBe(true);
    packaging.unitsPerPackage = 1;
    expect(product.packaging?.unitsPerPackage).toBe(70);

    for (const invalidPackaging of [
      {...packaging, unitsPerPackage: 1.5},
      {...packaging, packagesPerPallet: 0},
      {...packaging, palletGrossWeightKg: Number.NaN},
    ]) {
      expect(() =>
        new ProductTestBuilder().with({packaging: invalidPackaging}).buildReconstituted(),
      ).toThrow(InvalidProductPackagingError);
    }
  });

  it("allows omitted packaging and exposes inquiry-only pricing", () => {
    const product = new ProductTestBuilder().with({packaging: undefined}).buildReconstituted();
    expect(product.packaging).toBeUndefined();
    expect(product.pricing).toEqual({mode: "inquiry"});
    expect(Object.isFrozen(product.pricing)).toBe(true);
  });

  it("rejects duplicate image identifiers and sort orders", () => {
    const image = {
      id: "image-1",
      source: "/one.webp",
      sortOrder: 0,
      isPrimary: false,
    };
    expect(() =>
      new ProductTestBuilder()
        .with({images: [image, {...image, sortOrder: 1}]})
        .buildReconstituted(),
    ).toThrow(InvalidProductImageError);
    expect(() =>
      new ProductTestBuilder()
        .with({images: [image, {...image, id: "image-2"}]})
        .buildReconstituted(),
    ).toThrow(InvalidProductImageError);
  });

  it("rejects more than one primary image", () => {
    expect(() =>
      new ProductTestBuilder()
        .with({
          images: [
            {id: "one", source: "/one.webp", sortOrder: 0, isPrimary: true},
            {id: "two", source: "/two.webp", sortOrder: 1, isPrimary: true},
          ],
        })
        .buildReconstituted(),
    ).toThrow(InvalidProductImageError);
  });

  it("requires English content and exactly one primary image for publication", () => {
    const turkishContent = {
      tr: {
        name: "Test Şişesi",
        shortDescription: "Özet",
        fullDescription: "Açıklama",
        applications: ["Test"],
        seoTitle: "Test Şişesi",
        seoDescription: "SEO açıklaması",
      },
    };
    expect(() =>
      new ProductTestBuilder()
        .with({status: "published", content: turkishContent})
        .buildReconstituted(),
    ).toThrow(ProductPublicationError);
    expect(() =>
      new ProductTestBuilder()
        .with({status: "published", images: []})
        .buildReconstituted(),
    ).toThrow(ProductPublicationError);
    expect(() =>
      new ProductTestBuilder()
        .with({
          status: "published",
          images: [
            {id: "image-1", source: "/one.webp", sortOrder: 0, isPrimary: false},
          ],
        })
        .buildReconstituted(),
    ).toThrow(ProductPublicationError);
  });

  it.each([
    ["empty ID", {id: ""}],
    ["empty source", {source: ""}],
    ["negative order", {sortOrder: -1}],
    ["fractional order", {sortOrder: 0.5}],
    ["blank alt text", {alternativeText: {en: " "}}],
  ] as const)("rejects image with %s", (_label, imageOverride) => {
    expect(() =>
      new ProductTestBuilder()
        .with({
          images: [
            {
              id: "image-1",
              source: "/fixture.webp",
              sortOrder: 0,
              isPrimary: true,
              ...imageOverride,
            },
          ],
        })
        .buildReconstituted(),
    ).toThrow(InvalidProductImageError);
  });

  it("defensively protects specifications, images, content, and dates", () => {
    const specifications = {capacityMl: 500};
    const images = [
      {id: "image-1", source: "/one.webp", sortOrder: 0, isPrimary: true},
    ];
    const applications = ["Testing"];
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const product = Product.create({
      id: "product-1",
      sku: "TEST-001",
      slug: "test-product",
      categories: ["beverage"],
      specifications,
      pricing: {mode: "inquiry"},
      images,
      content: {
        en: {
          name: "Test Product",
          shortDescription: "Summary",
          fullDescription: "Description",
          applications,
          seoTitle: "SEO title",
          seoDescription: "SEO description",
        },
      },
      createdAt,
    });

    specifications.capacityMl = 999;
    images[0].source = "/changed.webp";
    applications[0] = "Changed";
    createdAt.setUTCFullYear(2030);
    const leakedCreatedAt = product.createdAt;
    leakedCreatedAt.setUTCFullYear(2040);
    const leakedUpdatedAt = product.updatedAt;
    leakedUpdatedAt.setUTCFullYear(2040);

    expect(product.specifications.capacityMl).toBe(500);
    expect(product.images[0].source).toBe("/one.webp");
    expect(product.getContent("en")?.applications).toEqual(["Testing"]);
    expect(product.createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(product.updatedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(Object.isFrozen(product.images)).toBe(true);
    expect(Object.isFrozen(product.getContent("en"))).toBe(true);
  });
});
