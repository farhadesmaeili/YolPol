import {InvalidProductNameError} from "@/features/products/domain/errors/product-errors";

export class ProductName {
  readonly #productNameBrand = true;

  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): ProductName {
    if (typeof value !== "string") {
      throw new InvalidProductNameError();
    }
    const normalized = value.trim().replace(/\s+/g, " ");

    if (normalized.length < 2 || normalized.length > 120) {
      throw new InvalidProductNameError();
    }

    return new ProductName(normalized);
  }
}
