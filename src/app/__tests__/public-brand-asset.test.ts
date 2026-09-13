import {readFileSync, statSync} from "node:fs";
import {describe, expect, it} from "vitest";

const logoPath = "public/images/brand/yolpol-logo.svg";

describe("public YolPol logo", () => {
  it("keeps a nonempty, bounded SVG without executable or external content", () => {
    expect(statSync(logoPath).size).toBeGreaterThan(0);
    const svg = readFileSync(logoPath, "utf8");

    expect(svg).toMatch(/^<svg\b[^>]*\bviewBox="0 0 1080 1080"/u);
    expect(svg).toMatch(/<\/svg>\s*$/u);
    expect(svg).not.toMatch(/<\/?(?:script|iframe|object|embed|foreignObject)\b/iu);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/iu);
    expect(svg).not.toMatch(/(?:href|src)\s*=|@import|url\s*\(/iu);
  });
});
