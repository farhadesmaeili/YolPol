import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {presentProductCategoryItems} from "@/features/products/presentation/presenters/product-category-presenter";

describe("Product detail category navigation", () => {
  it("links only categories with configured public routes", () => {
    expect(
      presentProductCategoryItems(
        ["olive-oil", "food", "beverage", "pharmaceutical"],
        (category) => `Localized ${category}`,
      ),
    ).toEqual([
      {id: "olive-oil", name: "Localized olive-oil", href: "/products/olive-oil"},
      {id: "food", name: "Localized food", href: "/products/food"},
      {id: "beverage", name: "Localized beverage", href: "/products/beverage"},
      {id: "pharmaceutical", name: "Localized pharmaceutical"},
    ]);
  });

  it("renders configured items as locale-aware links and unsupported items as text", () => {
    const source = readFileSync(
      "src/features/products/presentation/components/product-details.tsx",
      "utf8",
    );
    expect(source).toContain("if (!category.href) return category.name");
    expect(source).toContain("<Link");
    expect(source).toContain("href={category.href}");
    expect(source).not.toContain("/products/pharmaceutical");
  });
});
