import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ExportLoadCalculator} from "@/features/export-logistics/presentation/components/export-load-calculator";
import {packagingFixture} from "@/features/export-logistics/testing/fixtures/logistics-fixtures";

const labels = {
  heading: "Calculator", product: "Product", pallets: "Pallets", add: "Add", remove: "Remove", reset: "Reset",
  packages: "Packages", units: "Units", weight: "Weight", totals: "Totals", maximum: "maximum", remaining: "Remaining",
  feasible: "Feasible", palletExceeded: "Pallet exceeded", weightExceeded: "Weight exceeded", bothExceeded: "Both exceeded",
  insufficientData: "Insufficient data", invalid: "Invalid", arithmeticOverflow: "Overflow", kilograms: "kg", disclaimer: "Planning only",
} as const;

describe("ExportLoadCalculator", () => {
  it("renders a compact accessible icon remove button without repeated visible Product text", () => {
    const name = "250ml Olive Green Round Glass Bottle";
    const html = renderToStaticMarkup(<ExportLoadCalculator products={[{id: "product-1", sku: "SKU-1", name, packaging: packagingFixture()}]} labels={labels} locale="en" />);
    const match = html.match(/(<button type="button" aria-label="Remove: 250ml Olive Green Round Glass Bottle"[^>]*>)([\s\S]*?)<\/button>/u);
    expect(match).toBeDefined();
    expect(match?.[1]).toContain("size-11");
    expect(match?.[1]).toContain("bg-red-700");
    expect(match?.[2]).toContain('<svg aria-hidden="true"');
    expect(match?.[2]).not.toContain(name);
  });
});
