export const publicProductCategories = [
  {id: "olive-oil", href: "/products/olive-oil"},
  {id: "food", href: "/products/food"},
  {id: "beverage", href: "/products/beverage"},
] as const;

export type PublicProductCategory = (typeof publicProductCategories)[number]["id"];

export const primaryNavigation = [
  {id: "home", href: "/"},
  {id: "products", href: "/products"},
  ...publicProductCategories,
  {id: "export-logistics", href: "/export-logistics"},
  {id: "inquiry", href: "/inquiry"},
  {id: "about", href: "/about"},
  {id: "contact", href: "/contact"},
] as const;

export type PrimaryNavigationId = (typeof primaryNavigation)[number]["id"];

export const legalNavigation = [{id: "privacy", href: "/privacy"}] as const;

function requireUrl(value: string, protocols: readonly string[]): string {
  const url = new URL(value);
  if (!protocols.includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  return value;
}

const brandName = "YolPol";
const publicEmail = "yolpol@gmail.com";
const publicPhone = "+98 912 394 5674";
const publicWhatsapp = "+98 912 394 5674";

export const siteConfig = {
  url: "https://yolpol.com",
  logoPath: "/images/brand/yolpol-logo.svg",
  brandDescriptor: ["IR", "B2B", "INTL"],
  identity: {
    brandName,
    publicName: brandName,
    publicLocation: "Iran – Tehran",
  },
  contact: {
    email: publicEmail,
    emailHref: requireUrl(`mailto:${publicEmail}`, ["mailto:"]),
    phone: {
      display: publicPhone,
      href: requireUrl("tel:+989123945674", ["tel:"]),
    },
    whatsapp: {
      display: publicWhatsapp,
      href: requireUrl("https://wa.me/989123945674", ["https:"]),
    },
    location: {
      en: "Tehran, Iran",
      tr: "Tahran, İran",
      fa: "تهران، ایران",
      ar: "طهران، إيران",
    },
  },
  social: {
    instagram: requireUrl("https://www.instagram.com/yolpol/", ["https:"]),
    linkedin: requireUrl("https://www.linkedin.com/company/yolpol/", ["https:"]),
    telegram: requireUrl("https://t.me/yolpol", ["https:"]),
  },
} as const;

export const privacyPolicy = {
  publicName: siteConfig.identity.publicName,
  publicLocation: siteConfig.identity.publicLocation,
  lastUpdated: "2026-08-22",
  inquiryRetentionMonths: 24,
  securityRetentionDays: 30,
} as const;
