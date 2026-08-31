import {describe, expect, it} from "vitest";

import {siteConfig} from "@/shared/config/site";
import {createOrganizationJsonLd} from "@/shared/seo/organization-json-ld";
import {supportedLocales} from "@/shared/types/locale";

describe("Organization structured data", () => {
  it.each(supportedLocales)("uses only verified public Organization facts for %s", (locale) => {
    const jsonLd = createOrganizationJsonLd(locale);

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://yolpol.com/#organization",
      name: "YolPol",
      url: "https://yolpol.com",
      logo: "https://yolpol.com/images/brand/yolpol-logo.svg",
      address: {
        "@type": "PostalAddress",
        streetAddress: siteConfig.contact.location.officeAddress[locale],
        addressCountry: "IR",
      },
      contactPoint: [
        {"@type": "ContactPoint", contactType: "sales", telephone: "+989123945674"},
        {"@type": "ContactPoint", contactType: "sales", telephone: "+989121221942"},
      ],
      email: "yolpol@gmail.com",
      sameAs: [
        "https://www.instagram.com/yolpol/",
        "https://www.linkedin.com/company/yolpol/",
        "https://t.me/yolpol",
      ],
    });
  });

  it("omits unsupported commercial and business classifications", () => {
    const jsonLd = createOrganizationJsonLd("en");
    const serialized = JSON.stringify(jsonLd);

    for (const field of ["offers", "price", "priceCurrency", "openingHours", "areaServed", "legalName"]) {
      expect(jsonLd).not.toHaveProperty(field);
    }
    expect(serialized).not.toMatch(/LocalBusiness|WholesaleStore|Store|Manufacturer|LogisticsBusiness|DeliveryService|Offer/u);
  });
});
