import {describe, expect, it} from "vitest";

import {getLocaleDirection, isLocale} from "@/i18n/locale";

describe("locale configuration", () => {
  it.each([
    ["en", "ltr"],
    ["tr", "ltr"],
    ["fa", "rtl"],
    ["ar", "rtl"],
  ] as const)("uses the correct direction for %s", (locale, direction) => {
    expect(getLocaleDirection(locale)).toBe(direction);
  });

  it("rejects unsupported locale identifiers", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
});
