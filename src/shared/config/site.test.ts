import {describe, expect, it} from "vitest";

import {primaryNavigation, publicProductCategories, siteConfig} from "@/shared/config/site";

describe("site configuration", () => {
  it("owns the approved production origin", () => {
    expect(siteConfig.url).toBe("https://yolpol.com");
  });
  it("defines the approved navigation without a pharmaceutical route", () => {
    expect(primaryNavigation.map(({href}) => href)).toEqual([
      "/",
      "/products",
      "/products/olive-oil",
      "/products/food",
      "/products/beverage",
      "/about",
      "/contact",
    ]);
    expect(publicProductCategories.map(({id}) => id)).toEqual(["olive-oil", "food", "beverage"]);
    expect(JSON.stringify(primaryNavigation)).not.toContain("pharmaceutical");
  });

  it("owns exact contact destinations with safe schemes", () => {
    expect(siteConfig.contact).toEqual({email: "yolpol@gmail.com", emailHref: "mailto:yolpol@gmail.com", phone: "+98 912 394 5674", phoneHref: "tel:+989123945674", whatsapp: "+98 912 394 5674", whatsappHref: "https://wa.me/989123945674", location: "Tehran, Iran"});
    expect(siteConfig.social).toEqual({instagram: "https://www.instagram.com/yolpol/", linkedin: "https://www.linkedin.com/company/yolpol/", telegram: "https://t.me/yolpol"});
    for (const href of Object.values(siteConfig.social)) expect(new URL(href).protocol).toBe("https:");
    expect(JSON.stringify({primaryNavigation, siteConfig})).not.toContain('"#"');
  });
});
