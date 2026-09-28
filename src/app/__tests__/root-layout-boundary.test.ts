import {existsSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const publicRootLayoutPath = "src/app/[locale]/(public)/layout.tsx";
const staffRootLayoutPath = "src/app/[locale]/staff/layout.tsx";
const publicRootLayout = readFileSync(publicRootLayoutPath, "utf8");
const staffRootLayout = readFileSync(staffRootLayoutPath, "utf8");

describe("public and Staff root document boundary", () => {
  it("has no common layout above the independent public and Staff roots", () => {
    expect(existsSync("src/app/layout.tsx")).toBe(false);
    expect(existsSync("src/app/[locale]/layout.tsx")).toBe(false);
    expect(publicRootLayout).toContain("<html");
    expect(publicRootLayout).toContain("<body");
    expect(staffRootLayout).toContain("<html");
    expect(staffRootLayout).toContain("<body");
  });

  it("keeps analytics exclusively in the public root document", () => {
    expect(publicRootLayout).toContain("AnalyticsConsentProvider");
    expect(staffRootLayout).not.toMatch(/analytics|gtag|googletagmanager/iu);
    expect(staffRootLayout).not.toMatch(/PublicSiteFrame|SiteHeader|SiteFooter/u);
  });

  it("keeps the existing public route segments inside the URL-transparent route group", () => {
    const publicRouteFiles = [
      "page.tsx",
      "not-found.tsx",
      "about/page.tsx",
      "contact/page.tsx",
      "inquiry/page.tsx",
      "privacy/page.tsx",
      "products/page.tsx",
      "products/[slug]/page.tsx",
      "products/beverage/page.tsx",
      "products/food/page.tsx",
      "products/olive-oil/page.tsx",
      "wholesale-process/page.tsx",
    ];

    for (const routeFile of publicRouteFiles) {
      expect(existsSync(`src/app/[locale]/(public)/${routeFile}`)).toBe(true);
    }
  });
});
