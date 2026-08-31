import {siteConfig} from "@/shared/config/site";
import {absoluteUrl} from "@/shared/seo/metadata";
import type {Locale} from "@/shared/types/locale";

export type OrganizationJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Organization";
  "@id": string;
  name: string;
  url: string;
  logo: string;
  address: Readonly<{
    "@type": "PostalAddress";
    streetAddress: string;
    addressCountry: "IR";
  }>;
  contactPoint: readonly Readonly<{
    "@type": "ContactPoint";
    contactType: "sales";
    telephone: string;
  }>[];
  email: string;
  sameAs: readonly string[];
}>;

export function createOrganizationJsonLd(locale: Locale): OrganizationJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteConfig.url}/#organization`,
    name: siteConfig.identity.publicName,
    url: siteConfig.url,
    logo: absoluteUrl(siteConfig.logoPath),
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.contact.location.officeAddress[locale],
      addressCountry: "IR",
    },
    contactPoint: siteConfig.contact.phones.map(({href}) => ({
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: href.slice("tel:".length),
    })),
    email: siteConfig.contact.email,
    sameAs: Object.values(siteConfig.social),
  };
}
