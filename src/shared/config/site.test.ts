import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {legalNavigation, primaryNavigation, privacyPolicy, publicProductCategories, publicSocialLinks, siteConfig} from "@/shared/config/site";

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
      "/wholesale-process",
      "/inquiry",
      "/about",
      "/contact",
    ]);
    expect(publicProductCategories.map(({id}) => id)).toEqual(["olive-oil", "food", "beverage"]);
    expect(JSON.stringify(primaryNavigation)).not.toContain("pharmaceutical");
  });

  it("owns exact contact destinations with safe schemes", () => {
    expect(siteConfig.contact).toEqual({
      email: "export@yolpol.com",
      emailHref: "mailto:export@yolpol.com",
      phones: [
        {id: "mobile-primary", display: "+98 912 122 1942", href: "tel:+989121221942"},
        {id: "mobile-secondary", display: "+98 912 394 5674", href: "tel:+989123945674"},
      ],
      whatsapp: {display: "+98 912 394 5674", href: "https://wa.me/989123945674", isPublic: false},
      location: {
        summary: {en: "Tehran, Iran", tr: "Tahran, İran", fa: "تهران، ایران", ar: "طهران، إيران"},
        officeAddress: {
          en: "No. 5, West 1st Street, Daryano, Tarasht, Tehran, Iran",
          tr: "No: 5, Batı 1. Sokak, Daryano, Tarasht, Tahran, İran",
          fa: "ایران، تهران، ترشت، دریانو، خیابان یکم غربی، پلاک ۵",
          ar: "إيران، طهران، ترشت، دريانو، الشارع الأول الغربي، رقم ٥",
        },
      },
    });
    expect(siteConfig.social).toEqual({
      instagram: {id: "instagram", label: "Instagram", display: "@yolpol.hq", href: "https://www.instagram.com/yolpol.hq/", isPublic: true},
      linkedin: {id: "linkedin", label: "LinkedIn", display: "LinkedIn", href: "https://www.linkedin.com/company/yolpol/", isPublic: false},
      telegram: {id: "telegram", label: "Telegram", display: "@yolpol_hq", href: "https://t.me/yolpol_hq", isPublic: true},
    });
    expect(publicSocialLinks.map(({id, label, href}) => ({id, label, href}))).toEqual([
      {id: "instagram", label: "Instagram", href: "https://www.instagram.com/yolpol.hq/"},
      {id: "telegram", label: "Telegram", href: "https://t.me/yolpol_hq"},
    ]);
    for (const {href} of Object.values(siteConfig.social)) expect(new URL(href).protocol).toBe("https:");
    expect(JSON.stringify({primaryNavigation, siteConfig})).not.toContain('"#"');
  });

  it("keeps WhatsApp independent from the readonly phone collection", () => {
    const source = readFileSync("src/shared/config/site.ts", "utf8");
    expect(siteConfig.contact.phones).toHaveLength(2);
    expect(siteConfig.contact.phones.map(({id}) => id)).toEqual(["mobile-primary", "mobile-secondary"]);
    expect(siteConfig.contact.phones[0]).toEqual({
      id: "mobile-primary",
      display: "+98 912 122 1942",
      href: "tel:+989121221942",
    });
    expect(siteConfig.contact.whatsapp.href).toBe("https://wa.me/989123945674");
    expect(siteConfig.contact.whatsapp.isPublic).toBe(false);
    expect(siteConfig.contact.phones[0].display).not.toBe(siteConfig.contact.whatsapp.display);
    expect(source).not.toMatch(/whatsapp:[\s\S]{0,200}phones\[0\]/u);
  });

  it("owns the public designer attribution without additional personal details", () => {
    expect(siteConfig.designer).toEqual({
      name: "Farhad Esmaeili",
      email: "farhad.esmaeili.it@gmail.com",
      emailHref: "https://www.linkedin.com/in/farhad-esmaeili",
    });
  });

  it("owns stable approved Privacy facts and a footer-only route", () => {
    expect(siteConfig.identity).toEqual({brandName: "YolPol", publicName: "YolPol"});
    expect(privacyPolicy).toEqual({publicName: "YolPol", lastUpdated: "2026-08-31", inquiryRetentionMonths: 24, securityRetentionDays: 30});
    expect(legalNavigation).toEqual([{id: "privacy", href: "/privacy"}]);
    expect(primaryNavigation.map(({href}) => href)).not.toContain("/privacy");
  });
});
