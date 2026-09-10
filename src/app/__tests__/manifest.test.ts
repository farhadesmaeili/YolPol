import {existsSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import manifest from "@/app/manifest";
import enMessages from "@/i18n/messages/en.json";
import {siteConfig} from "@/shared/config/site";

describe("public app icon metadata", () => {
  it("keeps the favicon and Apple icon on Next.js file-based metadata paths", () => {
    expect(existsSync("src/app/favicon.ico")).toBe(true);
    expect(existsSync("src/app/apple-icon.png")).toBe(true);
  });

  it("defines a root-safe browser manifest with standard and maskable icons", () => {
    expect(manifest()).toEqual({
      name: siteConfig.identity.brandName.toUpperCase(),
      short_name: siteConfig.identity.brandName.toUpperCase(),
      description: enMessages.Metadata.description,
      start_url: "/",
      background_color: "#f7f6f1",
      theme_color: "#4f5d2f",
      icons: [
        {src: "/icons/icon-192.png", sizes: "192x192", type: "image/png"},
        {src: "/icons/icon-512.png", sizes: "512x512", type: "image/png"},
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
    expect(manifest()).not.toHaveProperty("display");
  });

  it("references every declared public manifest icon without adding PWA runtime code", () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(`public${icon.src}`)).toBe(true);
    }

    const packageSource = readFileSync("package.json", "utf8");
    const manifestSource = readFileSync("src/app/manifest.ts", "utf8");
    expect(`${packageSource}\n${manifestSource}`).not.toMatch(
      /next-pwa|workbox|serviceWorker|service worker/iu,
    );
  });
});
