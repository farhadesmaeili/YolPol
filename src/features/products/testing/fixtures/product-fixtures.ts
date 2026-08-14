import type {
  StaticLocalizedProductRecord,
  StaticTechnicalProductRecord,
} from "@/features/products/infrastructure/data/static-product-records";

export const createdAtIso = "2026-01-01T00:00:00.000Z";
export const updatedAtIso = "2026-01-02T00:00:00.000Z";

export function createTechnicalProductRecords(): StaticTechnicalProductRecord[] {
  return [
    {
      id: "beverage-1",
      sku: "TEST-BEV-1",
      slug: "beverage-fixture",
      category: "beverage",
      status: "published",
      specifications: {capacityMl: 330, weightGrams: 210},
      images: [
        {
          id: "beverage-image",
          source: "/fixtures/beverage.webp",
          sortOrder: 0,
          isPrimary: true,
        },
      ],
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
    },
    {
      id: "pharma-1",
      sku: "TEST-PHA-1",
      slug: "pharma-fixture",
      category: "pharmaceutical",
      status: "draft",
      specifications: {},
      images: [],
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
    },
    {
      id: "archived-1",
      sku: "TEST-ARC-1",
      slug: "archived-fixture",
      category: "beverage",
      status: "archived",
      specifications: {},
      images: [],
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
    },
  ];
}

export function createLocalizedProductRecords(): StaticLocalizedProductRecord[] {
  return [
    {
      productId: "beverage-1",
      locale: "en",
      name: "Beverage Test Bottle",
      shortDescription: "English fixture summary.",
      fullDescription: "English fixture description.",
      applications: ["Test application"],
      seoTitle: "Beverage Test Bottle",
      seoDescription: "English fixture SEO description.",
      imageAlternativeText: {"beverage-image": "Beverage test bottle"},
    },
    {
      productId: "beverage-1",
      locale: "tr",
      name: "İçecek Test Şişesi",
      shortDescription: "Türkçe test özeti.",
      fullDescription: "Türkçe test açıklaması.",
      applications: ["Test uygulaması"],
      seoTitle: "İçecek Test Şişesi",
      seoDescription: "Türkçe test SEO açıklaması.",
      imageAlternativeText: {"beverage-image": "İçecek test şişesi"},
    },
    {
      productId: "pharma-1",
      locale: "en",
      name: "Pharmaceutical Test Bottle",
      shortDescription: "English fixture summary.",
      fullDescription: "English fixture description.",
      applications: ["Test application"],
      seoTitle: "Pharmaceutical Test Bottle",
      seoDescription: "English fixture SEO description.",
    },
    {
      productId: "archived-1",
      locale: "en",
      name: "Archived Test Bottle",
      shortDescription: "Archived fixture summary.",
      fullDescription: "Archived fixture description.",
      applications: ["Test application"],
      seoTitle: "Archived Test Bottle",
      seoDescription: "Archived fixture SEO description.",
    },
  ];
}
