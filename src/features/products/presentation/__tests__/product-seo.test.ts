import {describe, expect, it} from "vitest";

import {createProductBreadcrumbJsonLd} from "@/features/products/presentation/seo/breadcrumb-json-ld";
import {serializeJsonLd} from "@/features/products/presentation/seo/json-ld-script";
import {createProductJsonLd} from "@/features/products/presentation/seo/product-json-ld";
import {
  createProductDetailMetadata,
  createProductListingMetadata,
} from "@/features/products/presentation/seo/product-metadata";
import {createProductSitemapEntries} from "@/features/products/presentation/seo/product-sitemap";
import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";
import {supportedLocales} from "@/shared/types/locale";

function productViewModel(): ProductViewModel {
  return {
    identity: {id: "product-1", sku: "TEST-001", slug: "test-product"},
    categories: ["food", "beverage"],
    status: "published",
    content: {
      locale: "en",
      name: "Verified test product",
      shortDescription: "Verified fixture summary.",
      fullDescription: "Verified fixture description.",
      applications: ["Testing"],
      seo: {title: "Verified SEO title", description: "Verified SEO description."},
    },
    specifications: {capacityMl: 500, glassColor: "clear", bottleShape: "round"},
    pricing: {mode: "inquiry"},
    images: [
      {
        id: "image-1",
        source: "/fixtures/product.webp",
        sortOrder: 0,
        isPrimary: true,
        alternativeText: "Verified product image",
      },
    ],
    timestamps: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  };
}

describe("product metadata", () => {
  it("creates localized listing canonical and all alternates", () => {
    const metadata = createProductListingMetadata({
      locale: "tr",
      title: "Ürünler",
      description: "Ürün açıklaması",
    });
    expect(metadata.alternates?.canonical).toBe("https://example.com/tr/products");
    expect(metadata.alternates?.languages).toEqual({
      en: "https://example.com/en/products",
      tr: "https://example.com/tr/products",
      fa: "https://example.com/fa/products",
      ar: "https://example.com/ar/products",
      "x-default": "https://example.com/en/products",
    });
  });

  it("uses verified product SEO and primary image metadata", () => {
    const metadata = createProductDetailMetadata({
      product: productViewModel(),
      availableLocales: supportedLocales,
    });
    expect(metadata).toMatchObject({
      title: "Verified SEO title",
      description: "Verified SEO description.",
      alternates: {canonical: "https://example.com/en/products/test-product"},
      openGraph: {
        title: "Verified SEO title",
        images: ["https://example.com/fixtures/product.webp"],
      },
    });
    expect(metadata.alternates?.languages).toHaveProperty(
      "x-default",
      "https://example.com/en/products/test-product",
    );
  });
});

describe("product structured data", () => {
  it("uses only verified Product fields and omits commercial schemas", () => {
    const jsonLd = createProductJsonLd({
      product: productViewModel(),
      categoryNames: ["Food bottles", "Beverage bottles"],
      labels: {
        capacity: "Capacity",
        milliliters: "ml",
        bottleShape: "Bottle shape",
        materialName: "Glass",
        colorName: "Clear",
        shapeName: "Round",
      },
    });
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: "Verified test product",
      sku: "TEST-001",
      category: ["Food bottles", "Beverage bottles"],
      color: "Clear",
      material: "Glass",
      url: "https://example.com/en/products/test-product",
      image: ["https://example.com/fixtures/product.webp"],
      additionalProperty: [
        {"@type": "PropertyValue", name: "Capacity", value: "500 ml"},
        {"@type": "PropertyValue", name: "Bottle shape", value: "Round"},
      ],
    });
    for (const forbiddenField of [
      "offers",
      "price",
      "currency",
      "availability",
      "aggregateRating",
      "review",
    ]) {
      expect(jsonLd).not.toHaveProperty(forbiddenField);
    }
  });

  it("creates localized breadcrumb structured data", () => {
    const jsonLd = createProductBreadcrumbJsonLd({
      locale: "fa",
      slug: "test-product",
      homeLabel: "خانه",
      productsLabel: "محصولات",
      productLabel: "محصول آزمایشی",
    });
    expect(jsonLd.itemListElement.map(({item}) => item)).toEqual([
      "https://example.com/fa",
      "https://example.com/fa/products",
      "https://example.com/fa/products/test-product",
    ]);
  });

  it("escapes less-than characters during JSON-LD serialization", () => {
    const serialized = serializeJsonLd({name: "</script><script>"});
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>");
  });
});

describe("product sitemap entries", () => {
  it("includes only supplied localized published routes in deterministic order", () => {
    const entries = createProductSitemapEntries([
      {locale: "tr", slug: "second-product"},
      {locale: "en", slug: "first-product"},
      {locale: "tr", slug: "first-product"},
    ]);
    expect(entries.map(({url}) => url)).toEqual([
      "https://example.com/en/products/first-product",
      "https://example.com/tr/products/first-product",
      "https://example.com/tr/products/second-product",
    ]);
    expect(entries[0].alternates?.languages).toEqual({
      en: "https://example.com/en/products/first-product",
      tr: "https://example.com/tr/products/first-product",
    });
    expect(entries.some(({url}) => url.includes("/fa/products/"))).toBe(false);
  });
});
