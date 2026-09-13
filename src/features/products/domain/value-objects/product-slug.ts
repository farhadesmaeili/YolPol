import {InvalidProductSlugError} from "@/features/products/domain/errors/product-errors";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ProductSlug {
  readonly #productSlugBrand = true;

  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): ProductSlug {
    if (typeof value !== "string") {
      throw new InvalidProductSlugError();
    }
    const normalized = value.trim();

    if (normalized.length > 120 || !slugPattern.test(normalized)) {
      throw new InvalidProductSlugError();
    }

    return new ProductSlug(normalized);
  }
}
