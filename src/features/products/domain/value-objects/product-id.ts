import {InvalidProductIdError} from "@/features/products/domain/errors/product-errors";

const productIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/;

export class ProductId {
  readonly #productIdBrand = true;

  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): ProductId {
    if (typeof value !== "string") {
      throw new InvalidProductIdError();
    }
    const normalized = value.trim();

    if (!productIdPattern.test(normalized)) {
      throw new InvalidProductIdError();
    }

    return new ProductId(normalized);
  }
}
