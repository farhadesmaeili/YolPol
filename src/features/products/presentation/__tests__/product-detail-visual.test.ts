import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("product detail image treatment", () => {
  const gallery = readFileSync("src/features/products/presentation/components/product-gallery.tsx", "utf8");

  it("keeps the canonical image contained without a visible card or frame", () => {
    expect(gallery).toContain("src={image.source}");
    expect(gallery).toContain("object-contain");
    expect(gallery).toContain("drop-shadow");
    expect(gallery).not.toMatch(/rounded-2xl|border-stone|bg-white\/40|overflow-hidden/u);
  });

  it("does not animate, scan, sweep, or zoom the product", () => {
    expect(gallery).not.toMatch(/animate-|scan|sweep|scale-|zoom/u);
  });
});
