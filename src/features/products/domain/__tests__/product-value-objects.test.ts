import {describe, expect, it} from "vitest";

import {
  InvalidProductIdError,
  InvalidProductNameError,
  InvalidProductSkuError,
  InvalidProductSlugError,
} from "@/features/products/domain/errors/product-errors";
import {ProductId} from "@/features/products/domain/value-objects/product-id";
import {ProductName} from "@/features/products/domain/value-objects/product-name";
import {ProductSku} from "@/features/products/domain/value-objects/product-sku";
import {ProductSlug} from "@/features/products/domain/value-objects/product-slug";

describe("product value objects", () => {
  it("uses nominal types that reject structurally similar plain objects", () => {
    // @ts-expect-error -- ProductId's private brand prevents structural assignment.
    const forgedId: ProductId = {value: "product-1"};
    // @ts-expect-error -- ProductName's private brand prevents structural assignment.
    const forgedName: ProductName = {value: "Product name"};

    expect(forgedId).not.toBeInstanceOf(ProductId);
    expect(forgedName).not.toBeInstanceOf(ProductName);
  });

  it.each([
    ProductId.create("product-1"),
    ProductSku.create("TEST-001"),
    ProductSlug.create("test-product"),
    ProductName.create("Test Product"),
  ])("freezes $constructor.name at runtime", (valueObject) => {
    const originalValue = valueObject.value;

    expect(Object.isFrozen(valueObject)).toBe(true);
    expect(Reflect.set(valueObject, "value", "changed")).toBe(false);
    expect(valueObject.value).toBe(originalValue);
  });

  it("accepts Product ID boundary lengths", () => {
    expect(ProductId.create("a").value).toBe("a");
    expect(ProductId.create(`a${"b".repeat(62)}c`).value).toHaveLength(64);
  });

  it.each(["", "contains spaces", "-leading", "trailing-", `a${"b".repeat(64)}`])(
    "rejects invalid Product ID %j",
    (value) => expect(() => ProductId.create(value)).toThrow(InvalidProductIdError),
  );

  it("normalizes SKU case and accepts its maximum length", () => {
    expect(ProductSku.create(" test_001 ").value).toBe("TEST_001");
    expect(ProductSku.create(`A${"B".repeat(63)}`).value).toHaveLength(64);
  });

  it.each(["", "A", "SKU 001", "SKU/001", `A${"B".repeat(64)}`])(
    "rejects invalid SKU %j",
    (value) => expect(() => ProductSku.create(value)).toThrow(InvalidProductSkuError),
  );

  it("accepts slug and name maximum lengths", () => {
    expect(ProductSlug.create("a".repeat(120)).value).toHaveLength(120);
    expect(ProductName.create("N".repeat(120)).value).toHaveLength(120);
  });

  it.each(["", "Uppercase", "two words", "leading-", "-trailing", "two--hyphens", "a".repeat(121)])(
    "rejects invalid slug %j",
    (value) => expect(() => ProductSlug.create(value)).toThrow(InvalidProductSlugError),
  );

  it.each(["", " ", "A", "x".repeat(121)])("rejects invalid name %j", (value) => {
    expect(() => ProductName.create(value)).toThrow(InvalidProductNameError);
  });
});
