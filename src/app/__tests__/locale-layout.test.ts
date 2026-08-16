import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("localized root layout", () => {
  it("declares intentional smooth scrolling on the dynamic root html element", () => {
    const source = readFileSync("src/app/[locale]/layout.tsx", "utf8");

    expect(source).toMatch(
      /<html\s+lang=\{locale\}\s+dir=\{getLocaleDirection\(locale as Locale\)\}\s+data-scroll-behavior="smooth"/u,
    );
    expect(source.match(/<html\b/gu)).toHaveLength(1);
  });
});
