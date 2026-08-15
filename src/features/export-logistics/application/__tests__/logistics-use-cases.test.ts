import {describe, expect, it} from "vitest";
import {CalculateExportLoadPlan} from "@/features/export-logistics/application/use-cases/calculate-export-load-plan";
import {ListEligibleLogisticsProducts} from "@/features/export-logistics/application/use-cases/list-eligible-logistics-products";
import {FakeLogisticsProductCatalog} from "@/features/export-logistics/testing/fakes/fake-logistics-product-catalog";

const base = {id: "p1", sku: "SKU", name: "Bottle", status: "published", locale: "en", packaging: {unitsPerPackage: 10, packagesPerPallet: 10, unitsPerPallet: 100, palletGrossWeightKg: 925}};
describe("Export Logistics use cases", () => {
  it("separates eligible and missing-profile Products", async () => { const result = await new ListEligibleLogisticsProducts(new FakeLogisticsProductCatalog([base, {...base, id: "p2", packaging: undefined}])).execute("en"); expect(result).toMatchObject({eligible: [{id: "p1"}], unavailable: [{id: "p2"}]}); });
  it("converts trusted kilograms to integer grams", async () => { const result = await new CalculateExportLoadPlan(new FakeLogisticsProductCatalog([base])).execute({lines: [{productId: "p1", palletCount: 1}]}, "en"); expect(result).toMatchObject({status: "calculated", totals: {grossWeightGrams: 925_000}}); });
  it("returns a missing Product outcome", async () => expect(new CalculateExportLoadPlan(new FakeLogisticsProductCatalog()).execute({lines: [{productId: "missing", palletCount: 1}]}, "en")).resolves.toMatchObject({status: "product_missing"}));
  it("rejects malformed kilogram values", async () => { const result = await new CalculateExportLoadPlan(new FakeLogisticsProductCatalog([{...base, packaging: {...base.packaging, palletGrossWeightKg: 0.5}}])).execute({lines: [{productId: "p1", palletCount: 1}]}, "en"); expect(result).toMatchObject({status: "malformed_catalog_data"}); });
});
