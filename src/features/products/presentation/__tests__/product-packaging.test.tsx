import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {getProductCatalogItem} from "@/composition/products/product-catalog";
import {ProductPackaging} from "@/features/products/presentation/components/product-packaging";
import {supportedLocales} from "@/shared/types/locale";

const packaging = {
  unitsPerPackage: 70,
  packagesPerPallet: 64,
  unitsPerPallet: 4_480,
  unitsPerTruck: 116_480,
  palletGrossWeightKg: 925,
};

describe("public Product packaging", () => {
  it("renders all approved fields including derived truck capacity", () => {
    const html = renderToStaticMarkup(
      <ProductPackaging
        packaging={packaging}
        locale="en"
        labels={{
          heading: "Packaging",
          unitsPerPackage: "Units per package",
          packagesPerPallet: "Packages per pallet",
          unitsPerPallet: "Units per pallet",
          unitsPerTruck: "Units per truck",
          palletGrossWeight: "Gross pallet weight",
          kilograms: "kg",
        }}
      />,
    );
    expect(html).toContain("116,480");
    expect(html).toContain("Units per truck");
    expect(html).not.toMatch(/180000|230000|350000|IRR|priceCurrency|offers/u);
  });

  it("gives all nine Products packaging and exact truck capacity in every locale", async () => {
    for (const locale of supportedLocales) {
      const detail = await getProductCatalogItem(
        "250ml-clear-round-glass-bottle",
        locale,
      );
      expect(detail.detail.status).toBe("ready");
      if (detail.detail.status !== "ready") continue;
      expect(detail.detail.product.packaging?.unitsPerTruck).toBe(116_480);
      expect(JSON.stringify(detail.detail.product)).not.toMatch(
        /internalUnitPrice|180000|230000|350000|IRR/u,
      );
    }
  });

  it("keeps the same complete packaging message keys in all locales", () => {
    const keys = [
      "heading",
      "kilograms",
      "packagesPerPallet",
      "palletGrossWeight",
      "unitsPerPackage",
      "unitsPerPallet",
      "unitsPerTruck",
    ];
    for (const locale of supportedLocales) {
      const messages = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, "utf8"),
      ) as {ProductPackaging: Record<string, string>};
      expect(Object.keys(messages.ProductPackaging).sort()).toEqual(keys);
      expect(Object.values(messages.ProductPackaging).every(Boolean)).toBe(true);
    }
  });
});
