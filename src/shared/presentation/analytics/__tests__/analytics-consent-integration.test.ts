import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";
import {getLocaleDirection} from "@/i18n/locale";

const locales = {en, tr, fa, ar} as const;

describe("localized analytics consent integration", () => {
  it("provides the complete consent namespace in every locale", () => {
    const expectedKeys = ["accept", "description", "privacyPolicy", "reject", "settings", "title"];
    for (const messages of Object.values(locales)) {
      expect(Object.keys(messages.AnalyticsConsent).sort()).toEqual(expectedKeys);
      expect(Object.values(messages.AnalyticsConsent).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("preserves the existing locale direction contract", () => {
    expect(getLocaleDirection("en")).toBe("ltr");
    expect(getLocaleDirection("tr")).toBe("ltr");
    expect(getLocaleDirection("fa")).toBe("rtl");
    expect(getLocaleDirection("ar")).toBe("rtl");
  });

  it("keeps runtime environment reads outside the static localized layout", () => {
    const layout = readFileSync("src/app/[locale]/(public)/layout.tsx", "utf8");
    const route = readFileSync("src/app/api/analytics/config/route.ts", "utf8");
    expect(layout).toContain("generateStaticParams");
    expect(layout).toContain("AnalyticsConsentProvider");
    expect(layout).not.toMatch(/process\.env|force-dynamic|connection\(/u);
    expect(route).toContain('dynamic = "force-dynamic"');
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });
});
