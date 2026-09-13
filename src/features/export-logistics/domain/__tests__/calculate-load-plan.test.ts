import {describe, expect, it} from "vitest";
import {calculateLoadPlan} from "@/features/export-logistics/domain/services/calculate-load-plan";
import {loadPlanLine} from "@/features/export-logistics/testing/builders/load-plan-builder";
import {packagingFixture} from "@/features/export-logistics/testing/fixtures/logistics-fixtures";

describe("calculateLoadPlan", () => {
  it("allows exactly 26 pallets", () => expect(calculateLoadPlan([loadPlanLine({palletCount: 26})])).toMatchObject({status: "calculated", assessment: "feasible"}));
  it("reports pallet-only exceed", () => expect(calculateLoadPlan([loadPlanLine({palletCount: 27})])).toMatchObject({assessment: "exceeds_pallet_limit"}));
  it("allows exactly 26,000,000 grams", () => expect(calculateLoadPlan([loadPlanLine({packaging: packagingFixture({grossPalletWeightGrams: 1_000_000}), palletCount: 26})])).toMatchObject({assessment: "feasible"}));
  it("reports weight-only exceed", () => expect(calculateLoadPlan([loadPlanLine({packaging: packagingFixture({grossPalletWeightGrams: 26_000_001})})])).toMatchObject({assessment: "exceeds_weight_limit"}));
  it("reports both limits", () => expect(calculateLoadPlan([loadPlanLine({packaging: packagingFixture({grossPalletWeightGrams: 1_000_000}), palletCount: 27})])).toMatchObject({assessment: "exceeds_pallet_and_weight_limits"}));
  it("sums a mixed load in integer grams", () => expect(calculateLoadPlan([loadPlanLine(), loadPlanLine({productId: "product-2", packaging: packagingFixture({productId: "product-2"}), palletCount: 2})])).toMatchObject({status: "calculated", totals: {pallets: 3, packages: 30, bottleUnits: 300, grossWeightGrams: 300_000}}));
  it("rejects an empty plan", () => expect(calculateLoadPlan([])).toMatchObject({status: "invalid_plan"}));
  it.each([0, -1, 1.5, Number.NaN, Infinity, "1"])("rejects invalid pallet count %s", (palletCount) => expect(calculateLoadPlan([loadPlanLine({palletCount})])).toMatchObject({status: "invalid_plan"}));
  it("rejects duplicate Products", () => expect(calculateLoadPlan([loadPlanLine(), loadPlanLine()])).toMatchObject({status: "invalid_plan", reason: "duplicate_product"}));
  it.each(["not a valid id", "", " ", " product-1", "product-1 ", "product\u0000-1", "a".repeat(65)])("rejects malformed line Product ID %j", (productId) => {
    const result = calculateLoadPlan([loadPlanLine({productId, packaging: packagingFixture({productId})})]);
    expect(result).toEqual({status: "invalid_plan", reason: "invalid_product_id"});
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("rejects a malformed snapshot ID even when it matches the malformed line ID", () => expect(calculateLoadPlan([loadPlanLine({productId: "not a valid id", packaging: packagingFixture({productId: "not a valid id"})})])).toEqual({status: "invalid_plan", reason: "invalid_product_id"}));
  it("rejects a malformed snapshot ID paired with a valid line ID", () => expect(calculateLoadPlan([loadPlanLine({productId: "product-1", packaging: packagingFixture({productId: "not a valid id"})})])).toEqual({status: "invalid_plan", reason: "invalid_packaging_snapshot"}));
  it("rejects a malformed line ID paired with a valid snapshot ID", () => expect(calculateLoadPlan([loadPlanLine({productId: "not a valid id", packaging: packagingFixture({productId: "product-1"})})])).toEqual({status: "invalid_plan", reason: "invalid_product_id"}));
  it("rejects different valid line and snapshot IDs", () => expect(calculateLoadPlan([loadPlanLine({productId: "product-1", packaging: packagingFixture({productId: "product-2"})})])).toEqual({status: "invalid_plan", reason: "invalid_packaging_snapshot"}));
  it("continues to calculate valid Product IDs", () => expect(calculateLoadPlan([loadPlanLine({productId: "ylp-gb-250-og-rd", packaging: packagingFixture({productId: "ylp-gb-250-og-rd"})})])).toMatchObject({status: "calculated", assessment: "feasible"}));
  it("reports insufficient data", () => expect(calculateLoadPlan([loadPlanLine({packaging: undefined})])).toEqual({status: "insufficient_data", productIds: ["product-1"]}));
  it("rejects inconsistent packaging", () => expect(calculateLoadPlan([loadPlanLine({packaging: packagingFixture({unitsPerPallet: 99})})])).toMatchObject({status: "invalid_plan"}));
  it("reports unsafe multiplication", () => expect(calculateLoadPlan([loadPlanLine({packaging: packagingFixture({unitsPerPackage: Number.MAX_SAFE_INTEGER, packagesPerPallet: 2, unitsPerPallet: Number.MAX_SAFE_INTEGER})})])).toMatchObject({status: "arithmetic_overflow"}));
  it("reports packages-per-pallet line overflow", () => expect(calculateLoadPlan([loadPlanLine({palletCount: 1_000_000_000, packaging: packagingFixture({unitsPerPackage: 1, packagesPerPallet: 10_000_000, unitsPerPallet: 10_000_000})})])).toMatchObject({status: "arithmetic_overflow"}));
  it("reports units-per-pallet line overflow", () => expect(calculateLoadPlan([loadPlanLine({palletCount: 1_000_000_000, packaging: packagingFixture({unitsPerPackage: 9_007_200, packagesPerPallet: 1, unitsPerPallet: 9_007_200})})])).toMatchObject({status: "arithmetic_overflow"}));
  it("reports gross-weight line overflow", () => expect(calculateLoadPlan([loadPlanLine({palletCount: 1_000_000_000, packaging: packagingFixture({grossPalletWeightGrams: 10_000_000})})])).toMatchObject({status: "arithmetic_overflow"}));
  it("reports accumulated total overflow", () => expect(calculateLoadPlan([loadPlanLine({productId: "p1", palletCount: 1_000_000_000, packaging: packagingFixture({productId: "p1", unitsPerPackage: 9_000_000, packagesPerPallet: 1, unitsPerPallet: 9_000_000})}), loadPlanLine({productId: "p2", palletCount: 1_000_000_000, packaging: packagingFixture({productId: "p2", unitsPerPackage: 9_000_000, packagesPerPallet: 1, unitsPerPallet: 9_000_000})})])).toMatchObject({status: "arithmetic_overflow"}));
  it("allows both exact policy limits", () => expect(calculateLoadPlan([loadPlanLine({palletCount: 26, packaging: packagingFixture({grossPalletWeightGrams: 1_000_000})})])).toMatchObject({status: "calculated", assessment: "feasible", totals: {pallets: 26, grossWeightGrams: 26_000_000}}));
  it("defensively copies returned snapshots", () => { const profile = packagingFixture(); const result = calculateLoadPlan([loadPlanLine({packaging: profile})]); expect(Object.isFrozen(result)).toBe(true); if (result.status === "calculated") expect(Object.isFrozen(result.lines[0].packaging)).toBe(true); });
  it("freezes invalid-plan results and preserves later calculations", () => {
    const result = calculateLoadPlan([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toEqual({status: "invalid_plan", reason: "empty_plan"});
    try { (result as {status: string}).status = "calculated"; } catch {}
    try { (result as {reason: string}).reason = "changed"; } catch {}
    expect(result).toEqual({status: "invalid_plan", reason: "empty_plan"});
    expect(calculateLoadPlan([])).toEqual({status: "invalid_plan", reason: "empty_plan"});
  });
  it("deep-freezes insufficient-data results and preserves later calculations", () => {
    const result = calculateLoadPlan([loadPlanLine({packaging: undefined})]);
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== "insufficient_data") return;
    expect(Object.isFrozen(result.productIds)).toBe(true);
    try { (result as {status: string}).status = "calculated"; } catch {}
    try { (result.productIds as string[]).push("changed"); } catch {}
    expect(result).toEqual({status: "insufficient_data", productIds: ["product-1"]});
    expect(calculateLoadPlan([loadPlanLine({packaging: undefined})])).toEqual(result);
  });
  it("freezes arithmetic-overflow results and preserves later calculations", () => {
    const input = [loadPlanLine({packaging: packagingFixture({unitsPerPackage: Number.MAX_SAFE_INTEGER, packagesPerPallet: 2, unitsPerPallet: Number.MAX_SAFE_INTEGER})})];
    const result = calculateLoadPlan(input);
    expect(Object.isFrozen(result)).toBe(true);
    try { (result as {status: string}).status = "calculated"; } catch {}
    expect(result).toEqual({status: "arithmetic_overflow"});
    expect(calculateLoadPlan(input)).toEqual(result);
  });
  it.each([
    ["feasible", loadPlanLine()],
    ["exceeds_pallet_limit", loadPlanLine({palletCount: 27})],
    ["exceeds_weight_limit", loadPlanLine({packaging: packagingFixture({grossPalletWeightGrams: 26_000_001})})],
    ["exceeds_pallet_and_weight_limits", loadPlanLine({palletCount: 27, packaging: packagingFixture({grossPalletWeightGrams: 1_000_000})})],
  ] as const)("deep-freezes the %s calculated result", (assessment, input) => {
    const result = calculateLoadPlan([input]);
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== "calculated") return;
    expect(result.assessment).toBe(assessment);
    expect(Object.isFrozen(result.lines)).toBe(true);
    expect(Object.isFrozen(result.lines[0])).toBe(true);
    expect(Object.isFrozen(result.lines[0].packaging)).toBe(true);
    expect(Object.isFrozen(result.totals)).toBe(true);
    const original = structuredClone(result);
    try { (result as {status: string}).status = "invalid_plan"; } catch {}
    try { (result.lines as unknown[]).push({}); } catch {}
    try { (result.lines[0] as {palletCount: number}).palletCount = 999; } catch {}
    try { (result.lines[0].packaging as {unitsPerPackage: number}).unitsPerPackage = 999; } catch {}
    try { (result.totals as {pallets: number}).pallets = 999; } catch {}
    expect(result).toEqual(original);
    expect(calculateLoadPlan([input])).toEqual(original);
  });
});
