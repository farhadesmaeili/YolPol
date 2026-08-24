import {describe, expect, it} from "vitest";

import {legalNavigation, primaryNavigation, privacyPolicy, publicProductCategories, siteConfig} from "@/shared/config/site";

describe("site configuration", () => {
  it("owns the approved production origin", () => {
    expect(siteConfig.url).toBe("https://yolpol.com");
    expect(siteConfig.brandDescriptor).toEqual(["IR", "B2B", "INTL"]);
  });
  it("defines the approved navigation without a pharmaceutical route", () => {
    expect(primaryNavigation.map(({href}) => href)).toEqual([
      "/",
      "/products",
      "/products/olive-oil",
      "/products/food",
      "/products/beverage",
      "/export-logistics",
      "/inquiry",
      "/about",
      "/contact",
    ]);
    expect(publicProductCategories.map(({id}) => id)).toEqual(["olive-oil", "food", "beverage"]);
    expect(JSON.stringify(primaryNavigation)).not.toContain("pharmaceutical");
  });

  it("owns exact contact destinations with safe schemes", () => {
    expect(siteConfig.contact).toEqual({email: "yolpol@gmail.com", emailHref: "mailto:yolpol@gmail.com", phone: {display: "+98 912 394 5674", href: "tel:+989123945674"}, whatsapp: {display: "+98 912 394 5674", href: "https://wa.me/989123945674"}, location: {en: "Tehran, Iran", tr: "Tahran, İran", fa: "تهران، ایران", ar: "طهران، إيران"}});
    expect(siteConfig.social).toEqual({instagram: "https://www.instagram.com/yolpol/", linkedin: "https://www.linkedin.com/company/yolpol/", telegram: "https://t.me/yolpol"});
    for (const href of Object.values(siteConfig.social)) expect(new URL(href).protocol).toBe("https:");
    expect(JSON.stringify({primaryNavigation, siteConfig})).not.toContain('"#"');
  });

  it("owns stable approved Privacy facts and a footer-only route", () => {
    expect(siteConfig.identity).toEqual({brandName: "YolPol", publicName: "YolPol", publicLocation: "Iran – Tehran"});
    expect(privacyPolicy).toEqual({publicName: "YolPol", publicLocation: "Iran – Tehran", lastUpdated: "2026-08-22", inquiryRetentionMonths: 24, securityRetentionDays: 30});
    expect(legalNavigation).toEqual([{id: "privacy", href: "/privacy"}]);
    expect(primaryNavigation.map(({href}) => href)).not.toContain("/privacy");
  });
});
