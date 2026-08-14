import {
  Product,
  type ReconstituteProductInput,
} from "@/features/products/domain/entities/product";

const defaultInput = (): ReconstituteProductInput => ({
  id: "product-1",
  sku: "TEST-001",
  slug: "test-product",
  category: "beverage",
  status: "draft",
  specifications: {capacityMl: 500},
  images: [
    {
      id: "image-1",
      source: "/fixtures/product-1.webp",
      sortOrder: 0,
      isPrimary: true,
      alternativeText: {en: "Test product bottle"},
    },
  ],
  content: {
    en: {
      name: "Test Bottle",
      shortDescription: "Fixture short description.",
      fullDescription: "Fixture full description for domain tests.",
      applications: ["Testing"],
      seoTitle: "Test Bottle",
      seoDescription: "Fixture SEO description.",
    },
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
});

export class ProductTestBuilder {
  private input: ReconstituteProductInput = defaultInput();

  with(overrides: Partial<ReconstituteProductInput>): ProductTestBuilder {
    this.input = {...this.input, ...overrides};
    return this;
  }

  buildNew(): Product {
    return Product.create({
      id: this.input.id,
      sku: this.input.sku,
      slug: this.input.slug,
      category: this.input.category,
      specifications: this.input.specifications,
      images: this.input.images,
      content: this.input.content,
      createdAt: this.input.createdAt,
    });
  }

  buildReconstituted(): Product {
    return Product.reconstitute(this.input);
  }
}
