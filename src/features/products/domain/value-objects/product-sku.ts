import {InvalidProductSkuError} from "@/features/products/domain/errors/product-errors";

const skuPattern = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

export class ProductSku {
  readonly #productSkuBrand = true;

  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): ProductSku {
    if (typeof value !== "string") {
      throw new InvalidProductSkuError();
    }
    const normalized = value.trim().toUpperCase();

    if (!skuPattern.test(normalized)) {
      throw new InvalidProductSkuError();
    }

    return new ProductSku(normalized);
  }
}
