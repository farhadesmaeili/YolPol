import {describe, expect, it} from "vitest";
import {getExportLogisticsPageModel} from "@/composition/export-logistics/export-logistics";

describe("production Export Logistics Product boundary", () => {
  it("returns all nine verified profiles with no unavailable Products", async () => {
    const model = await getExportLogisticsPageModel("en");
    expect(model.status).toBe("ready");
    if (model.status !== "ready") return;
    expect(model.eligible.map(({id, name, packaging}) => ({id, name, unitsPerPackage: packaging.unitsPerPackage, packagesPerPallet: packaging.packagesPerPallet, unitsPerPallet: packaging.unitsPerPallet, grossPalletWeightGrams: packaging.grossPalletWeightGrams}))).toEqual([
      {id: "ylp-gb-250-og-rd", name: "250ml Olive Green Round Glass Bottle", unitsPerPackage: 70, packagesPerPallet: 64, unitsPerPallet: 4_480, grossPalletWeightGrams: 925_000},
      {id: "ylp-gb-250-og-sq", name: "250ml Olive Green Square Glass Bottle", unitsPerPackage: 56, packagesPerPallet: 81, unitsPerPallet: 4_536, grossPalletWeightGrams: 960_000},
      {id: "ylp-gb-250-cl-rd", name: "250ml Clear Round Glass Bottle", unitsPerPackage: 70, packagesPerPallet: 64, unitsPerPallet: 4_480, grossPalletWeightGrams: 925_000},
      {id: "ylp-gb-250-cl-sq", name: "250ml Clear Square Glass Bottle", unitsPerPackage: 56, packagesPerPallet: 81, unitsPerPallet: 4_536, grossPalletWeightGrams: 960_000},
      {id: "ylp-gb-500-og-rd", name: "500ml Olive Green Round Glass Bottle", unitsPerPackage: 36, packagesPerPallet: 63, unitsPerPallet: 2_268, grossPalletWeightGrams: 790_000},
      {id: "ylp-gb-500-og-sq", name: "500ml Olive Green Square Glass Bottle", unitsPerPackage: 35, packagesPerPallet: 70, unitsPerPallet: 2_450, grossPalletWeightGrams: 815_000},
      {id: "ylp-gb-500-cl-rd", name: "500ml Clear Round Glass Bottle", unitsPerPackage: 36, packagesPerPallet: 63, unitsPerPallet: 2_268, grossPalletWeightGrams: 790_000},
      {id: "ylp-gb-500-cl-sq", name: "500ml Clear Square Glass Bottle", unitsPerPackage: 35, packagesPerPallet: 70, unitsPerPallet: 2_450, grossPalletWeightGrams: 815_000},
      {id: "ylp-gb-700-og-rd", name: "700ml Olive Green Round Glass Bottle", unitsPerPackage: 28, packagesPerPallet: 56, unitsPerPallet: 1_568, grossPalletWeightGrams: 700_000},
    ]);
    expect(model.unavailable).toEqual([]);
    expect(JSON.stringify(model)).not.toMatch(/internalUnitPrice|180000|230000|350000|currency/u);
  });
});
