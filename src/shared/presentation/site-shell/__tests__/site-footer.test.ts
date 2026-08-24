import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  legalNavigation,
  primaryNavigation,
  publicProductCategories,
  siteConfig,
} from "@/shared/config/site";
import { supportedLocales } from "@/shared/types/locale";

const footerSource = readFileSync(
  "src/shared/presentation/site-shell/site-footer.tsx",
  "utf8",
);
const footerComponentSource = [
  "footer-background.tsx",
  "footer-brand.tsx",
  "footer-call-to-action.tsx",
  "footer-contact.tsx",
  "footer-export-strip.tsx",
  "footer-link-column.tsx",
  "footer-section-heading.tsx",
].map((file) => readFileSync(`src/shared/presentation/site-shell/footer/${file}`, "utf8")).join("\n");
const completeFooterSource = `${footerSource}\n${footerComponentSource}`;
const headerSource = readFileSync(
  "src/shared/presentation/site-shell/site-header.tsx",
  "utf8",
);
const navigationSource = readFileSync(
  "src/shared/presentation/site-shell/site-navigation.tsx",
  "utf8",
);

describe("SiteFooter", () => {
  it("remains a localized Server Component using centralized shell data", () => {
    expect(footerSource).not.toMatch(/^"use client"/u);
    expect(headerSource).not.toMatch(/^"use client"/u);
    expect(navigationSource).toMatch(/^"use client"/u);
    expect(footerSource).toContain('from "next-intl/server"');
    expect(footerSource).not.toMatch(/i18n\/messages|\.json["']/u);
    expect(footerSource).toContain("primaryNavigation.filter");
    expect(footerSource).toContain("publicProductCategories.map");
    expect(footerSource).toContain("legalNavigation.map");
  });

  it("uses the canonical framed logo with explicit intrinsic dimensions", () => {
    expect(siteConfig.logoPath).toBe("/images/brand/yolpol-logo.svg");
    expect(completeFooterSource).toContain("src={siteConfig.logoPath}");
    expect(completeFooterSource).toContain("width={48}");
    expect(completeFooterSource).toContain("height={48}");
    expect(completeFooterSource).not.toMatch(/<h1\b/u);
  });

  it("separates general navigation from every approved public category", () => {
    const generalDestinations = primaryNavigation
      .filter(
        ({ id }) =>
          !publicProductCategories.some((category) => category.id === id),
      )
      .map(({ href }) => href);

    expect(generalDestinations).toEqual([
      "/",
      "/products",
      "/export-logistics",
      "/inquiry",
      "/about",
      "/contact",
    ]);
    expect(publicProductCategories.map(({ href }) => href)).toEqual([
      "/products/olive-oil",
      "/products/food",
      "/products/beverage",
    ]);
    expect(JSON.stringify(publicProductCategories)).not.toContain("pharmaceutical");
    expect(legalNavigation).toEqual([{ id: "privacy", href: "/privacy" }]);
  });

  it("uses centralized contact links, bidi isolation, and safe external links", () => {
    expect(completeFooterSource).toContain("siteConfig.contact.emailHref");
    expect(completeFooterSource).toContain("siteConfig.contact.phone.href");
    expect(completeFooterSource).toContain("siteConfig.contact.whatsapp.href");
    expect(completeFooterSource.match(/<LtrIsolate/g)).toHaveLength(3);
    expect(completeFooterSource).toContain('rel="noopener noreferrer"');
    expect(footerSource).toContain('instagram: t("social.instagram")');
    expect(footerSource).toContain('linkedin: t("social.linkedin")');
    expect(footerSource).toContain('telegram: t("social.telegram")');
    expect(completeFooterSource).toContain("aria-label={label}");
  });

  it("uses the approved emerald CTA and accessible decorative treatment", () => {
    expect(completeFooterSource).toContain('href="/contact"');
    expect(completeFooterSource).toContain("bg-emerald-950");
    expect(completeFooterSource).not.toContain("bg-stone-950 text-white");
    expect(completeFooterSource).toContain("motion-reduce:animate-none");
    expect(completeFooterSource).toMatch(/aria-hidden="true"[\s\S]*?YOLPOL/u);
  });

  it("keeps the existing footer orbit visible, pointer-inert, and responsive", () => {
    expect(completeFooterSource).toContain("pointer-events-none absolute -end-28 top-12 z-[1] size-72");
    expect(completeFooterSource).toContain("lg:-end-[16rem] lg:size-[620px] lg:max-w-[55vw] xl:size-[760px]");
    expect(completeFooterSource).not.toContain("z-[1] hidden size-[620px]");
    expect(completeFooterSource.match(/animate-\[spin_/gu)).toHaveLength(3);
  });

  it("keeps verified market identity neutral and excludes the unverified Iraq token", () => {
    expect(completeFooterSource).toContain("<span>TR</span>");
    expect(completeFooterSource).toContain("<span>GCC</span>");
    expect(completeFooterSource).toContain("<span>INTL</span>");
    expect(completeFooterSource).not.toContain("<span>IQ</span>");
  });

  it("keeps all locale catalogs structurally aligned", () => {
    const structures = supportedLocales.map((locale) => {
      const messages = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, "utf8"),
      ) as Record<string, unknown>;
      return collectKeyPaths(messages);
    });
    structures.slice(1).forEach((structure) => {
      expect(structure).toEqual(structures[0]);
    });
  });
});

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) =>
      collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
    )
    .sort();
}
