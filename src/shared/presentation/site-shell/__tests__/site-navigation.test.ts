import { readFileSync } from "node:fs";
import {createRef, type ReactElement} from "react";
import { describe, expect, it } from "vitest";

import { primaryNavigation, siteConfig } from "@/shared/config/site";
import {
  getContainedFocusIndex,
  resolveActiveNavigationHref,
} from "@/shared/presentation/site-shell/site-navigation-behavior";
import { supportedLocales } from "@/shared/types/locale";
import {MobileMenuTrigger} from "@/shared/presentation/site-shell/mobile-menu-trigger";

const headerPath = "src/shared/presentation/site-shell/site-header.tsx";
const navigationPath = "src/shared/presentation/site-shell/site-navigation.tsx";
const headerSource = readFileSync(headerPath, "utf8");
const headerComponentSource = ["header-background.tsx", "header-brand.tsx"]
  .map((file) => readFileSync(`src/shared/presentation/site-shell/header/${file}`, "utf8"))
  .join("\n");
const completeHeaderSource = `${headerSource}\n${headerComponentSource}`;
const navigationSource = readFileSync(navigationPath, "utf8");
const triggerSource = readFileSync("src/shared/presentation/site-shell/mobile-menu-trigger.tsx", "utf8");
const navigationItems = primaryNavigation.map(({ id, href }) => ({
  id,
  href,
  label: id,
}));

describe("site shell boundaries", () => {
  it("keeps translation resolution in the Server Component and interaction in one Client Component", () => {
    expect(headerSource).not.toMatch(/^"use client"/u);
    expect(headerSource).toContain('from "next-intl/server"');
    expect(headerSource).toContain("primaryNavigation.map");
    expect(navigationSource).toMatch(/^"use client"/u);
    expect(navigationSource).not.toMatch(/i18n\/messages|\.json["']/u);
  });

  it("uses the canonical logo without adding a header heading or status claim", () => {
    expect(siteConfig.logoPath).toBe("/images/brand/yolpol-logo.svg");
    expect(completeHeaderSource).toContain("src={siteConfig.logoPath}");
    expect(completeHeaderSource).toContain("width={48}");
    expect(completeHeaderSource).toContain("height={48}");
    expect(completeHeaderSource).not.toMatch(/<h1\b/u);
    expect(completeHeaderSource).not.toContain("ACTIVE");
  });

  it("keeps desktop and compact navigation on one non-overlapping breakpoint", () => {
    expect(navigationSource).toContain("xl:hidden");
    expect(navigationSource).toContain("xl:flex");
    expect(navigationSource).not.toMatch(/min-\[(?:1536|1800)px\]|2xl:(?:flex|hidden)/u);
    expect(navigationSource).not.toMatch(/(?:w-screen|min-w-\[\d)/u);
  });

  it("keeps the mobile trigger above decoration with an explicit touch target", () => {
    expect(headerComponentSource).toMatch(/pointer-events-none/g);
    expect(headerComponentSource).toContain("-start-10 top-1/2 size-20");
    expect(headerComponentSource).toContain("lg:-start-20 lg:size-44");
    expect(headerComponentSource).not.toContain("top-1/2 hidden size-44");
    expect(triggerSource).toContain("pointer-events-auto");
    expect(triggerSource).toContain("touch-manipulation");
    expect(triggerSource).toContain("min-h-12 min-w-12");
    expect(navigationSource).toContain("createPortal");
    expect(navigationSource).not.toContain("replaceAll");
  });

  it("wires the production trigger to a real button and executes its click callback", () => {
    let clicks = 0;
    const element = MobileMenuTrigger({buttonRef: createRef<HTMLButtonElement>(), panelId: "mobile-site-navigation", isOpen: false, openLabel: "Open", closeLabel: "Close", onToggle: () => { clicks += 1; }}) as ReactElement<{type: string; onClick: () => void; "aria-expanded": boolean; "aria-controls": string}>;
    expect(element.type).toBe("button");
    expect(element.props.type).toBe("button");
    expect(element.props["aria-expanded"]).toBe(false);
    expect(element.props["aria-controls"]).toBe("mobile-site-navigation");
    element.props.onClick();
    expect(clicks).toBe(1);
  });

  it("retains reduced-motion handling and production interaction cleanup", () => {
    expect(`${completeHeaderSource}\n${navigationSource}`).toContain("motion-reduce:animate-none");
    expect(navigationSource).toContain('document.addEventListener("keydown", handleKeyDown)');
    expect(navigationSource).toContain('document.removeEventListener("keydown", handleKeyDown)');
    expect(navigationSource).toContain("document.body.style.overflow = previousOverflow");
    expect(navigationSource).toContain("triggerRef.current?.focus()");
  });
});

describe("active navigation resolution", () => {
  it.each([
    ["/", "/"],
    ["/products", "/products"],
    ["/products/olive-oil", "/products/olive-oil"],
    ["/products/olive-oil/bottle", "/products/olive-oil"],
    ["/products/verified-bottle", "/products"],
    ["/wholesale-process", "/wholesale-process"],
  ])("resolves %s to %s", (pathname, expected) => {
    expect(resolveActiveNavigationHref(pathname, navigationItems)).toBe(expected);
  });

  it("does not activate Home on another path", () => {
    expect(resolveActiveNavigationHref("/unknown", navigationItems)).toBeUndefined();
  });
});

describe("contained focus behavior", () => {
  it("wraps forward from the last control to the trigger", () => {
    expect(getContainedFocusIndex(4, 5, false)).toBe(0);
  });

  it("wraps backward from the trigger to the last control", () => {
    expect(getContainedFocusIndex(0, 5, true)).toBe(4);
  });

  it("does not interfere away from focus boundaries", () => {
    expect(getContainedFocusIndex(2, 5, false)).toBeUndefined();
    expect(getContainedFocusIndex(2, 5, true)).toBeUndefined();
  });
});

describe("localized navigation data", () => {
  it("keeps every locale catalog structurally identical", () => {
    const structures = supportedLocales.map((locale) => {
      const messages = JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, "utf8")) as Record<string, unknown>;
      return collectKeyPaths(messages);
    });
    for (const structure of structures.slice(1)) {
      expect(structure).toEqual(structures[0]);
    }
  });

  it("renders configured destinations and all canonical locale codes through centralized data", () => {
    expect(headerSource).toContain("primaryNavigation.map");
    expect(headerSource).toContain("supportedLocales.map");
    expect(primaryNavigation.map(({ href }) => href)).toHaveLength(9);
    expect(JSON.stringify(primaryNavigation)).not.toContain("pharmaceutical");
    expect(supportedLocales).toEqual(["en", "tr", "fa", "ar"]);
    expect(navigationSource).toContain("hrefLang={candidate.id}");
    expect(navigationSource).toContain('dir="ltr"');
  });

  it("keeps decorative mobile indices out of the accessibility tree", () => {
    expect(navigationSource).toMatch(/aria-hidden="true"[\s\S]*?padStart\(2, "0"\)/u);
  });

  it("centers the desktop active marker independently of text direction", () => {
    expect(navigationSource).toContain("left-1/2 size-2 -translate-x-1/2");
    expect(navigationSource).not.toContain("start-1/2 size-2 -translate-x-1/2");
  });
});

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => collectKeyPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}
