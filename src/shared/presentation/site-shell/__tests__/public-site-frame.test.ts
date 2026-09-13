import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";

const frameSource = readFileSync(
  "src/shared/presentation/site-shell/public-site-frame.tsx",
  "utf8",
);
const layoutSource = readFileSync("src/app/[locale]/layout.tsx", "utf8");

describe("public skip-to-content navigation", () => {
  it("is focus-revealed, keyboard accessible, and targets the public main landmark", () => {
    expect(frameSource).toContain('href="#main-content"');
    expect(frameSource).toContain("sr-only");
    expect(frameSource).toContain("focus:not-sr-only");
    expect(frameSource).toContain('main id="main-content"');
    expect(frameSource).toContain("focus:start-4");
  });

  it("resolves a natural label from every locale catalog", () => {
    expect([
      en.SiteShell.skipToContent,
      tr.SiteShell.skipToContent,
      fa.SiteShell.skipToContent,
      ar.SiteShell.skipToContent,
    ]).toEqual([
      "Skip to main content",
      "Ana içeriğe geç",
      "رفتن به محتوای اصلی",
      "الانتقال إلى المحتوى الرئيسي",
    ]);
    expect(layoutSource).toContain('siteShell("skipToContent")');
    expect(layoutSource).toContain("skipToContent={siteShell");
  });
});
