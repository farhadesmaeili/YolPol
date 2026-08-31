import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("public RTL alignment", () => {
  it("uses inline-start alignment for localized homepage content", () => {
    const hero = source("src/shared/presentation/home/components/home-hero-content.tsx");
    const capacity = source("src/shared/presentation/home/components/home-export-capacity-card.tsx");
    expect(hero).toContain("text-start");
    expect(hero).toContain("me-auto");
    expect(hero).toContain("border-s");
    expect(hero).toContain("justify-start");
    expect(hero).not.toMatch(/text-end|ms-auto|border-e pe-5|justify-end/u);
    expect(capacity).toContain("text-start");
    expect(capacity).not.toContain("text-end");
  });

  it("centers physical decorations independently of document direction", () => {
    const centeredSources = [
      source("src/shared/presentation/home/components/home-hero.tsx"),
      source("src/features/products/presentation/components/product-catalog-page.tsx"),
      source("src/shared/presentation/site-shell/site-navigation.tsx"),
    ].join("\n");
    expect(centeredSources).toContain("left-1/2");
    expect(centeredSources).not.toMatch(/start-1\/2[^\n]*-translate-x-1\/2/u);
  });

  it("gives major public page shells and Product facts an explicit logical baseline", () => {
    for (const path of [
      "src/shared/presentation/marketing/premium-page-shell.tsx",
      "src/features/products/presentation/components/product-catalog-page.tsx",
      "src/features/products/presentation/components/product-details.tsx",
      "src/features/products/presentation/components/product-specifications.tsx",
      "src/features/products/presentation/components/product-packaging.tsx",
      "src/features/inquiries/presentation/components/inquiry-form.tsx",
    ]) expect(source(path)).toContain("text-start");
  });

  it("does not apply Latin negative heading tracking to Persian or Arabic Product headings", () => {
    const catalogHeader = source("src/features/products/presentation/components/product-catalog-header.tsx");
    const productDetails = source("src/features/products/presentation/components/product-details.tsx");
    expect(catalogHeader).toContain('isRtl ? "" : "tracking-[-0.04em]"');
    expect(productDetails).toContain('locale === "fa" || locale === "ar" ? "" : "tracking-[-0.05em]"');
  });
});
