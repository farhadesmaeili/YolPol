import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getExportCapacityPolicy } from "@/composition/export-logistics/export-logistics";
import { formatHumanNumber } from "@/shared/presentation/bidi/bidi-isolate";
import { supportedLocales } from "@/shared/types/locale";

const routeSource = readFileSync("src/app/[locale]/page.tsx", "utf8");
const componentSources = [
  "home-hero.tsx",
  "home-hero-background.tsx",
  "home-hero-content.tsx",
  "home-hero-visual.tsx",
  "home-export-capacity-card.tsx",
  "home-export-truck-diagram.tsx",
  "home-export-pallet-grid.tsx",
].map((file) =>
  readFileSync(`src/shared/presentation/home/components/${file}`, "utf8"),
);
const combinedSource = componentSources.join("\n");
const animationSource = readFileSync(
  "src/shared/presentation/home/styles/home-hero.module.css",
  "utf8",
);

describe("homepage presentation architecture", () => {
  it("keeps the localized route thin and the homepage server-rendered", () => {
    expect(routeSource).not.toContain('"use client"');
    expect(combinedSource).not.toContain('"use client"');
    expect(routeSource).toContain("<HomeHero");
    expect(routeSource).toContain("setRequestLocale(locale)");
    expect(routeSource).toContain("hasLocale(routing.locales, locale)");
    expect(routeSource.split("\n").length).toBeLessThan(85);
  });

  it("owns animation in a scoped stylesheet with reduced-motion coverage", () => {
    expect(combinedSource).not.toMatch(/<style\b/u);
    expect(combinedSource).toContain("home-hero.module.css");
    expect(animationSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(animationSource).not.toMatch(/@media \(max-width: 639px\)[^{]*\{[^}]*\.pallet/u);
    for (const name of ["imageLtr", "imageRtl", "portal", "sweepLtr", "sweepRtl", "scan", "floatingCard", "ambient", "route", "scanner", "pallet"]) {
      expect(animationSource).toMatch(new RegExp(`\\.${name}[^}]*animation`, "u"));
      expect(animationSource).toContain(`.${name}`);
    }
    expect(combinedSource).toContain("motion-reduce:animate-none");
  });

  it("renders exactly one localized H1 without introducing a main landmark", () => {
    expect(combinedSource.match(/<h1\b/g)).toHaveLength(1);
    expect(combinedSource).not.toMatch(/<main\b/u);
    expect(combinedSource).toContain("model.heading");
  });

  it("sets textual base direction from the active locale while keeping visual-only regions isolated", () => {
    expect(combinedSource).toContain('dir={model.isRtl ? "rtl" : "ltr"}');
    expect(combinedSource).toContain('<div dir="ltr"');
    expect(combinedSource).not.toContain('<HomeHeroContent dir="ltr"');
  });
});

describe("homepage facts and assets", () => {
  it("uses the approved optimized image and localized alt model", () => {
    expect(combinedSource).toContain('src="/images/home/hero/yolpol-home-hero-desktop.webp"');
    expect(combinedSource).toContain("alt={model.imageAlt}");
    expect(combinedSource).toContain("priority");
    expect(combinedSource).toContain('sizes="(min-width: 1024px) 58vw, 94vw"');
  });

  it("preserves the user image bytes", () => {
    const desktop = readFileSync("public/images/home/hero/yolpol-home-hero-desktop.webp");
    const mobile = readFileSync("public/images/home/hero/yolpol-home-hero-mobile.webp");
    expect(createHash("sha256").update(desktop).digest("hex")).toBe("5ce510a48269dbfaca5989b546c093c0fcc73c8826248af7816b077caeb3f649");
    expect(desktop.equals(mobile)).toBe(true);
  });

  it("uses the authoritative export-capacity policy and shared number formatter", () => {
    expect(getExportCapacityPolicy()).toEqual({
      maxPallets: 26,
      maxGrossWeightKilograms: 26_000,
    });
    expect(routeSource).toContain("formatHumanNumber");
    expect(formatHumanNumber("fa", 26_000)).toBe("۲۶٬۰۰۰");
    expect(formatHumanNumber("ar", 26_000)).toBe("٢٦٬٠٠٠");
    expect(combinedSource).toContain("Array.from({ length: palletCount }");
    expect(combinedSource).toContain('aria-hidden="true"');
  });

  it("renders a connected complete truck around exactly 26 decorative pallets", () => {
    expect(combinedSource).toContain('data-home-trailer=""');
    expect(combinedSource).toContain('data-home-cabin=""');
    expect(combinedSource).toContain('data-home-windshield=""');
    expect(combinedSource).toContain('data-home-bumper=""');
    expect(combinedSource).toContain('data-home-chassis=""');
    expect(combinedSource.match(/data-home-wheel-group=/g)).toHaveLength(3);
    expect(combinedSource).toContain("sm:grid-cols-13");
    expect(combinedSource).toContain("aspect-square");
  });

  it("keeps one visible, responsive orb on each pointer-inert Hero orbit", () => {
    expect(combinedSource.match(/data-home-orbit-orb=/g)).toHaveLength(3);
    expect(combinedSource).toContain("pointer-events-none absolute inset-0 overflow-hidden");
    expect(combinedSource).toContain("size-[min(105vw,850px)]");
    expect(combinedSource).toContain("size-[min(88vw,700px)]");
    expect(combinedSource).toContain("size-[min(70vw,580px)]");
    expect(combinedSource.match(/z-20[^"]*motion-reduce:animate-none/g)).toHaveLength(3);
  });

  it("keeps approved crawlable actions and removes fabricated status claims", () => {
    expect(combinedSource).toContain('href="/products"');
    expect(combinedSource).toContain('href="/inquiry"');
    expect(combinedSource).toContain('href="/wholesale-process"');
    expect(combinedSource).toContain("bg-emerald-950");
    expect(combinedSource).not.toMatch(/\b(?:READY|ACTIVE)\b/u);
  });
});

describe("homepage localization", () => {
  it("keeps matching homepage structures and required localized labels", () => {
    const homeMessages = supportedLocales.map((locale) => {
      const messages = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, "utf8"),
      ) as { HomePage: Record<string, string> };
      return messages.HomePage;
    });
    const expectedKeys = Object.keys(homeMessages[0]).sort();
    for (const messages of homeMessages) {
      expect(Object.keys(messages).sort()).toEqual(expectedKeys);
      expect(Object.values(messages).every((value) => value.trim().length > 0)).toBe(true);
    }
    expect(homeMessages.map(({heading, description}) => ({heading, description}))).toEqual([
      {
        heading: "Wholesale goods supply in Iran for domestic and international buyers",
        description: "YOLPOL helps business buyers source wholesale goods in Iran through a commercial process based on price and availability inquiries.",
      },
      {
        heading: "İran'da yerel ve uluslararası alıcılar için toptan mal tedariki",
        description: "YOLPOL, ticari alıcıların İran'daki toptan malları fiyat ve stok durumu sorgulamasına dayalı ticari bir süreç üzerinden tedarik etmelerine yardımcı olur.",
      },
      {
        heading: "تأمین عمده کالا در ایران برای خریداران داخلی و بین‌المللی",
        description: "یول‌پل به خریداران تجاری کمک می‌کند کالاهای عمده را در ایران از طریق یک فرآیند تجاری مبتنی بر استعلام قیمت و موجودی تأمین کنند.",
      },
      {
        heading: "توريد السلع بالجملة في إيران للمشترين المحليين والدوليين",
        description: "تساعد YOLPOL المشترين التجاريين على تأمين السلع بالجملة في إيران من خلال عملية تجارية قائمة على الاستعلام عن الأسعار ومدى التوفر.",
      },
    ]);
    expect(routeSource).toContain('const isRtl = locale === "fa" || locale === "ar"');
    expect(JSON.stringify(homeMessages)).not.toMatch(/internalUnitPrice|margin|unit cost/iu);
  });
});
