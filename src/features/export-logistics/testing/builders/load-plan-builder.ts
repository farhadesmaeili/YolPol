import type {LoadPlanInputLine} from "@/features/export-logistics/domain/types/load-plan";
import {packagingFixture} from "@/features/export-logistics/testing/fixtures/logistics-fixtures";

export function loadPlanLine(overrides: Partial<LoadPlanInputLine> = {}): LoadPlanInputLine { return {productId: "product-1", palletCount: 1, packaging: packagingFixture(), ...overrides}; }
