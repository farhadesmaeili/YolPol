import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { listProductCatalog } from "@/composition/products/product-catalog";
import { publicProductCategories } from "@/shared/config/site";
import { formatHumanNumber } from "@/shared/presentation/bidi/bidi-isolate";
import { supportedLocales } from "@/shared/types/locale";

const routeSource = readFileSync("src/app/[locale]/products/page.tsx", "utf8");
const componentFiles = [
  "product-catalog-page.tsx",
  "product-category-index.tsx",
  "product-catalog-header.tsx",
  "product-catalog-frame.tsx",
  "product-catalog-bottom-rail.tsx",
];
const presentationSource = componentFiles
  .map((file) => readFileSync(`src/features/products/presentation/components/${file}`, "utf8"))
  .join("\n");

describe("Product catalog page composition", () => {
  it("keeps the route server-rendered, static, and focused on composition", () => {
    expect(routeSource).not.toContain('"use client"');
    expect(routeSource).toContain('export const dynamic = "force-static"');
    expect(routeSource).toContain("generateStaticParams");
    expect(routeSource).toContain("generateMetadata");
    expect(routeSource).toContain("listProductCatalog(locale)");
    expect(routeSource).toContain("<ProductCatalogPage");
    expect(routeSource).not.toMatch(/<main\b/u);
    expect(routeSource.split("\n").length).toBeLessThan(110);
  });

  it("renders exactly one localized heading without moving content behind a client boundary", () => {
    expect(presentationSource.match(/<h1\b/g)).toHaveLength(1);
    expect(presentationSource).not.toContain('"use client"');
    expect(presentationSource).not.toMatch(/<main\b/u);
    expect(presentationSource).toContain("model.heading");
  });

  it("uses exactly the three centralized public category destinations", () => {
    expect(publicProductCategories).toEqual([
      { id: "olive-oil", href: "/products/olive-oil" },
      { id: "food", href: "/products/food" },
      { id: "beverage", href: "/products/beverage" },
    ]);
    expect(JSON.stringify(publicProductCategories)).not.toContain("pharmaceutical");
    expect(routeSource).toContain("publicProductCategories.map");
  });

  it("keeps all nine published localized products and locale-aware count digits", async () => {
    for (const locale of supportedLocales) {
      const catalog = await listProductCatalog(locale);
      expect(catalog.products).toHaveLength(9);
      expect(catalog.products.every((product) => product.status === "published")).toBe(true);
    }
    expect(formatHumanNumber("en", 9)).toBe("9");
    expect(formatHumanNumber("tr", 9)).toBe("9");
    expect(formatHumanNumber("fa", 9)).toBe("۹");
    expect(formatHumanNumber("ar", 9)).toBe("٩");
    expect(routeSource).toContain("formatHumanNumber(locale, catalog.products.length)");
    expect(routeSource).not.toContain("padStart");
  });

  it("projects exact derived truck capacity for all nine Products without pricing", async () => {
    const catalog = await listProductCatalog("en");
    expect(
      catalog.products.map((product) => [
        product.identity.id,
        product.packaging?.unitsPerTruck,
      ]),
    ).toEqual([
      ["ylp-gb-250-og-rd", 116_480],
      ["ylp-gb-250-og-sq", 117_936],
      ["ylp-gb-250-cl-rd", 116_480],
      ["ylp-gb-250-cl-sq", 117_936],
      ["ylp-gb-500-og-rd", 58_968],
      ["ylp-gb-500-og-sq", 63_700],
      ["ylp-gb-500-cl-rd", 58_968],
      ["ylp-gb-500-cl-sq", 63_700],
      ["ylp-gb-700-og-rd", 40_768],
    ]);
    expect(JSON.stringify(catalog)).not.toMatch(
      /internalUnitPrice|180000|230000|350000|IRR|priceCurrency|offers/u,
    );
  });

  it("uses localized factual labels without a hardcoded locale switch or false status", () => {
    expect(routeSource).toContain('products("catalog.publishedValue")');
    expect(routeSource).toContain('products("catalog.inquiryValue")');
    expect(routeSource).not.toMatch(/switch\s*\(locale\)/u);
    expect(presentationSource).not.toMatch(/\bACTIVE\b/u);
    expect(presentationSource).not.toMatch(/\b(?:price|availability)\s*:/iu);
  });
});
