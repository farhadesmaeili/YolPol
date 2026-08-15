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
  {id: "about", href: "/about"},
  {id: "contact", href: "/contact"},
] as const;

export type PrimaryNavigationId = (typeof primaryNavigation)[number]["id"];

function requireUrl(value: string, protocols: readonly string[]): string {
  const url = new URL(value);
  if (!protocols.includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  return value;
}

/** Replace the placeholder origin when YolPol's production domain is confirmed. */
export const siteConfig = {
  name: "YolPol",
  url: "https://example.com",
  logoPath: "/images/brand/yolpol-logo.svg",
  contact: {
    email: "yolpol@gmail.com",
    emailHref: requireUrl("mailto:yolpol@gmail.com", ["mailto:"]),
    phone: "+98 912 394 5674",
    phoneHref: requireUrl("tel:+989123945674", ["tel:"]),
    whatsapp: "+98 912 394 5674",
    whatsappHref: requireUrl("https://wa.me/989123945674", ["https:"]),
    location: "Tehran, Iran",
  },
  social: {
    instagram: requireUrl("https://www.instagram.com/yolpol/", ["https:"]),
    linkedin: requireUrl("https://www.linkedin.com/company/yolpol/", ["https:"]),
    telegram: requireUrl("https://t.me/yolpol", ["https:"]),
  },
} as const;
