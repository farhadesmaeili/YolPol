import {describe, expect, it} from "vitest";

import type {ProductDto} from "@/features/products/application/dto/product-dto";
import {ProductPresenter} from "@/features/products/presentation/presenters/product-presenter";

const productDto = (): ProductDto => ({
  id: "product-1",
  sku: "TEST-001",
  slug: "test-product",
  categories: ["food", "beverage"],
  status: "published",
  locale: "en",
  name: "Test Bottle",
  shortDescription: "Summary",
  fullDescription: "Description",
  applications: ["Testing"],
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  specifications: {capacityMl: 500, glassColor: "clear", bottleShape: "round"},
  packaging: {
    unitsPerPackage: 10,
    packagesPerPallet: 20,
    unitsPerPallet: 200,
    palletGrossWeightKg: 300,
  },
  pricing: {mode: "inquiry"},
  images: [
    {id: "second", source: "/second.webp", sortOrder: 2, isPrimary: false},
    {
      id: "first",
      source: "/first.webp",
      sortOrder: 1,
      isPrimary: true,
      alternativeText: "Test bottle",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
});

describe("ProductPresenter", () => {
  it("maps application data into a grouped, presentation-ready view model", () => {
    const result = new ProductPresenter(26).presentDetail({
      status: "found",
      product: productDto(),
    });
    expect(result).toMatchObject({
      status: "ready",
      product: {
        identity: {id: "product-1", sku: "TEST-001", slug: "test-product"},
        categories: ["food", "beverage"],
        specifications: {
          capacityMl: 500,
          glassColor: "clear",
          bottleShape: "round",
        },
        packaging: {unitsPerPallet: 200, unitsPerTruck: 5200},
        pricing: {mode: "inquiry"},
        content: {
          locale: "en",
          name: "Test Bottle",
          seo: {title: "SEO title", description: "SEO description"},
        },
        timestamps: {
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/amount|currency|offers/i);
  });

  it("preserves images in deterministic sort order without mutating the DTO", () => {
    const dto = productDto();
    const result = new ProductPresenter(26).presentList({products: [dto]});
    expect(result.products[0].images.map((image) => image.id)).toEqual([
      "first",
      "second",
    ]);
    expect(dto.images.map((image) => image.id)).toEqual(["second", "first"]);
  });

  it.each(["not_found", "locale_not_available"] as const)(
    "preserves the explicit %s query outcome",
    (status) => {
      expect(new ProductPresenter(26).presentDetail({status})).toEqual({status});
    },
  );
});
