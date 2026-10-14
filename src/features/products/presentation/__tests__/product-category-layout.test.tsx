import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createCategoryMetadata } from "@/app/[locale]/_site-metadata";
import { listProductCatalog } from "@/composition/products/product-catalog";
import { ProductCatalogFrame } from "@/features/products/presentation/components/product-catalog-frame";
import { ProductCatalogSection, ProductCatalogSurface } from "@/features/products/presentation/components/product-catalog-section";
import { getLocaleDirection } from "@/i18n/locale";
import { createBreadcrumbJsonLd } from "@/shared/seo/breadcrumb-json-ld";
import { supportedLocales } from "@/shared/types/locale";

const categories = ["beverage", "food", "olive-oil"] as const;
const catalogPageSource = readFileSync("src/features/products/presentation/components/product-catalog-page.tsx", "utf8");
const categoryRouteSource = readFileSync("src/app/[locale]/(public)/products/_category-route.tsx", "utf8");
const catalogHeaderSource = readFileSync("src/features/products/presentation/components/product-catalog-header.tsx", "utf8");
const gridSource = readFileSync("src/features/products/presentation/components/product-grid.tsx", "utf8");

describe("Category product layout parity", () => {
  it("composes both listings with the same surface, section, frame, grid, and card", () => {
    for (const source of [catalogPageSource, categoryRouteSource]) {
      expect(source).toContain("<ProductCatalogSurface");
      expect(source).toContain("<ProductCatalogSection>");
      expect(source).toContain("<ProductCatalogFrame>");
      expect(source).toContain("<ProductGrid");
      expect(source).toContain('className="mt-0"');
    }
    expect(gridSource).toContain("<ProductCard");
    expect(gridSource).toContain("grid gap-6 sm:grid-cols-2 lg:grid-cols-3");
    expect(categoryRouteSource).toContain("listProductCatalog(locale, {category})");
    expect(categoryRouteSource).not.toContain("max-w-6xl");
    expect(categoryRouteSource).toContain("className={productCatalogHeadingFrameClassName}");
    expect(catalogHeaderSource).toContain("className={productCatalogHeadingFrameClassName}");
  });

  it("renders the shared mobile-first container and one/two/three-column grid in both directions", () => {
    for (const isRtl of [false, true]) {
      const markup = renderToStaticMarkup(
        <ProductCatalogSurface isRtl={isRtl}>
          <ProductCatalogSection>
            <ProductCatalogFrame>{null}</ProductCatalogFrame>
          </ProductCatalogSection>
        </ProductCatalogSurface>,
      );
      expect(markup).toContain(`dir="${isRtl ? "rtl" : "ltr"}"`);
      expect(markup).toContain("max-w-[1900px] px-4 sm:px-8 lg:px-14 xl:px-20 2xl:px-24");
      expect(markup).toContain("pointer-events-none absolute -start-2 -top-2");
    }
  });

  it("keeps each static category route, breadcrumb, and localized metadata", () => {
    expect(categoryRouteSource).toContain("setRequestLocale(locale)");
    expect(categoryRouteSource).toContain("<ProductListHeader");
    expect(categoryRouteSource).toContain("<JsonLdScript data={createBreadcrumbJsonLd");
    expect(categoryRouteSource).not.toContain('"use client"');

    for (const category of categories) {
      const pageSource = readFileSync(`src/app/[locale]/(public)/products/${category}/page.tsx`, "utf8");
      expect(pageSource).toContain(`category="${category}"`);
      expect(pageSource).toContain(`createCategoryMetadata(locale,"${category}")`);
      expect(pageSource).not.toContain('"use client"');

      for (const locale of supportedLocales) {
        const metadata = createCategoryMetadata(locale, category);
        expect(metadata.alternates?.canonical).toBe(`https://yolpol.com/${locale}/products/${category}`);
        expect(metadata.alternates?.languages).toHaveProperty("x-default", `https://yolpol.com/en/products/${category}`);
        const breadcrumb = createBreadcrumbJsonLd({
          locale,
          items: [
            { name: "Home", pathname: "/" },
            { name: "Products", pathname: "/products" },
            { name: category, pathname: `/products/${category}` },
          ],
        });
        expect(breadcrumb.itemListElement.at(-1)?.item).toBe(`https://yolpol.com/${locale}/products/${category}`);
      }
    }
  });

  it("keeps the correct published, inquiry-only products for all twelve routes", async () => {
    expect(supportedLocales).toEqual(["en", "tr", "fa", "ar"]);
    expect(supportedLocales.map(getLocaleDirection)).toEqual(["ltr", "ltr", "rtl", "rtl"]);
    expect(categoryRouteSource).toContain('isRtl={locale === "fa" || locale === "ar"}');

    for (const locale of supportedLocales) {
      const all = await listProductCatalog(locale);
      for (const category of categories) {
        const filtered = await listProductCatalog(locale, { category });
        expect(filtered.products.map((product) => product.identity.id)).toEqual(
          all.products.filter((product) => product.categories.includes(category)).map((product) => product.identity.id),
        );
        expect(filtered.products.length).toBeGreaterThan(0);
        expect(filtered.products.every((product) => product.status === "published" && product.content.locale === locale && product.pricing.mode === "inquiry")).toBe(true);
        expect(JSON.stringify(filtered.products)).not.toMatch(/internalUnitPrice|priceCurrency|offers/u);
      }
    }
  });
});
