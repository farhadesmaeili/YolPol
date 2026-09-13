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
  {id: "wholesale-process", href: "/wholesale-process"},
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
const publicEmail = "export@yolpol.com";
const publicWhatsapp = "+98 912 394 5674";
const designerEmail = "farhad.esmaeili.it@gmail.com";

export const siteConfig = {
  url: "https://yolpol.com",
  logoPath: "/images/brand/yolpol-logo.svg",
  brandDescriptor: ["IR", "B2B", "INTL"],
  identity: {
    brandName,
    publicName: brandName,
  },
  contact: {
    email: publicEmail,
    emailHref: requireUrl(`mailto:${publicEmail}`, ["mailto:"]),
    phones: [
      {
        id: "mobile-primary",
        display: "+98 912 122 1942",
        href: requireUrl("tel:+989121221942", ["tel:"]),
      },
      {
        id: "mobile-secondary",
        display: "+98 912 394 5674",
        href: requireUrl("tel:+989123945674", ["tel:"]),
      },
    ],
    whatsapp: {
      display: publicWhatsapp,
      href: requireUrl("https://wa.me/989123945674", ["https:"]),
      isPublic: false,
    },
    location: {
      summary: {
        en: "Tehran, Iran",
        tr: "Tahran, İran",
        fa: "تهران، ایران",
        ar: "طهران، إيران",
      },
      officeAddress: {
        en: "No. 5, West 1st Street, Daryano, Tarasht, Tehran, Iran",
        tr: "No: 5, Batı 1. Sokak, Daryano, Tarasht, Tahran, İran",
        fa: "ایران، تهران، ترشت، دریانو، خیابان یکم غربی، پلاک ۵",
        ar: "إيران، طهران، ترشت، دريانو، الشارع الأول الغربي، رقم ٥",
      },
    },
  },
  social: {
    instagram: {
      id: "instagram",
      label: "Instagram",
      display: "@yolpol.hq",
      href: requireUrl("https://www.instagram.com/yolpol.hq/", ["https:"]),
      isPublic: true,
    },
    linkedin: {
      id: "linkedin",
      label: "LinkedIn",
      display: "LinkedIn",
      href: requireUrl("https://www.linkedin.com/company/yolpol/", ["https:"]),
      isPublic: false,
    },
    telegram: {
      id: "telegram",
      label: "Telegram",
      display: "@yolpol_hq",
      href: requireUrl("https://t.me/yolpol_hq", ["https:"]),
      isPublic: true,
    },
  },
  designer: {
    name: "Farhad Esmaeili",
    email: designerEmail,
    emailHref: requireUrl("https://www.linkedin.com/in/farhad-esmaeili", ["https:"]),
  },
} as const;

type SocialLink = (typeof siteConfig.social)[keyof typeof siteConfig.social];
type PublicSocialLink = Extract<SocialLink, { isPublic: true }>;

export const publicSocialLinks = Object.values(siteConfig.social).filter(
  (social): social is PublicSocialLink => social.isPublic,
);

export const privacyPolicy = {
  publicName: siteConfig.identity.publicName,
  lastUpdated: "2026-08-31",
  inquiryRetentionMonths: 24,
  securityRetentionDays: 30,
} as const;
