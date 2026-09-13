import {readFileSync, statSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {getLocaleFontClass, localeFontClass} from "@/shared/presentation/typography/locale-font";

const fonts = [
  ["public/fonts/persian/brand-persian.woff2", "774f4632"],
  ["public/fonts/arabic/brand-arabic.woff2", "774f4632"],
] as const;

describe("localized self-hosted fonts", () => {
  it.each(fonts)("keeps %s nonempty with the expected file signature", (path, signature) => {
    expect(statSync(path).size).toBeGreaterThan(0);
    expect(readFileSync(path).subarray(0, 4).toString("hex")).toBe(signature);
  });

  it("maps the active locale at the server-rendered layout boundary", () => {
    expect(localeFontClass).toEqual({en: "font-sans", tr: "font-sans", fa: "font-brand-persian", ar: "font-brand-arabic"});
    expect(getLocaleFontClass("en")).toBe("font-sans");
    expect(getLocaleFontClass("tr")).toBe("font-sans");
    expect(getLocaleFontClass("fa")).toBe("font-brand-persian");
    expect(getLocaleFontClass("ar")).toBe("font-brand-arabic");
  });

  it("retains the established system fallback stack", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--font-sans: Arial, Helvetica, sans-serif");
    expect(css).toContain("font-family: Arial, Helvetica, sans-serif");
    expect(css).toContain('"YolPol Persian", Arial, Helvetica, sans-serif');
    expect(css).toContain('"YolPol Arabic", Arial, Helvetica, sans-serif');
    expect(css).toContain("font-display: swap");
    expect(css).not.toContain("/fonts/latin/");
    expect(css).not.toContain("YolPol Latin");
  });
});
