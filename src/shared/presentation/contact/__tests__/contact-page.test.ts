import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {siteConfig} from "@/shared/config/site";
import {supportedLocales} from "@/shared/types/locale";

const componentSource = readFileSync(
  "src/shared/presentation/contact/components/contact-page.tsx",
  "utf8",
);
const routeSource = readFileSync("src/app/[locale]/contact/page.tsx", "utf8");

describe("localized public Contact presentation", () => {
  it("renders both centralized phones and keeps WhatsApp independent", () => {
    expect(siteConfig.contact.phones.map(({href}) => href)).toEqual([
      "tel:+989123945674",
      "tel:+989121221942",
    ]);
    expect(componentSource).toContain("siteConfig.contact.phones.map");
    expect(componentSource).toContain("href={phone.href}");
    expect(componentSource).toContain("siteConfig.contact.whatsapp.href");
    expect(siteConfig.contact.whatsapp.href).toBe("https://wa.me/989123945674");
    expect(componentSource).not.toContain("phones[0]");
  });

  it.each(supportedLocales)("uses the full centralized office address for %s", (locale) => {
    expect(siteConfig.contact.location.officeAddress[locale].trim()).not.toBe("");
    expect(routeSource).toContain("siteConfig.contact.location.officeAddress[locale]");
    expect(componentSource).toContain("model.contactLocation");
    expect(componentSource).not.toContain(siteConfig.contact.location.officeAddress[locale]);
  });

  it("keeps email, safe social links, Inquiry CTA, and locale-aware typography", () => {
    expect(componentSource).toContain("siteConfig.contact.emailHref");
    expect(componentSource).toContain('href="/inquiry"');
    expect(componentSource).toContain('rel="noopener noreferrer"');
    expect(componentSource).toContain("model.isRtl");
    expect(routeSource).toContain('locale === "fa" || locale === "ar"');
  });
});
