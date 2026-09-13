import {describe, expect, it} from "vitest";
import {calculationMessageKey, presentLogisticsProducts} from "@/features/export-logistics/presentation/presenters/logistics-presenter";
import type {LoadPlanResult} from "@/features/export-logistics/domain/types/load-plan";

const totals = {pallets: 0, packages: 0, bottleUnits: 0, grossWeightGrams: 0};

describe("LogisticsPresenter", () => {
  it.each(["catalog_failure", "malformed_catalog_data"] as const)("maps %s listing results", (status) => expect(presentLogisticsProducts({status})).toEqual({status}));
  it("maps a ready listing", () => expect(presentLogisticsProducts({status: "ready", eligible: [], unavailable: []})).toEqual({status: "ready", eligible: [], unavailable: []}));
  it.each([
    [{status: "calculated", assessment: "feasible", lines: [], totals: totals}, "feasible"],
    [{status: "calculated", assessment: "exceeds_pallet_limit", lines: [], totals}, "palletExceeded"],
    [{status: "calculated", assessment: "exceeds_weight_limit", lines: [], totals}, "weightExceeded"],
    [{status: "calculated", assessment: "exceeds_pallet_and_weight_limits", lines: [], totals}, "bothExceeded"],
    [{status: "insufficient_data", productIds: ["p1"]}, "insufficientData"],
    [{status: "invalid_plan", reason: "invalid"}, "invalid"],
    [{status: "arithmetic_overflow"}, "arithmeticOverflow"],
  ] as readonly (readonly [LoadPlanResult, string])[])("maps every calculation outcome to %s", (result, key) => expect(calculationMessageKey(result)).toBe(key));
});
