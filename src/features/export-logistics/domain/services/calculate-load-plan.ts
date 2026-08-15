import {maxRequestedPalletsPerLine, truckCapacityPolicy, type CalculatedLoadLine, type LoadPlanInputLine, type LoadPlanResult, type PackagingSnapshot} from "@/features/export-logistics/domain/types/load-plan";
import {isProductIdentifier} from "@/features/export-logistics/domain/validation/product-identifier";

const safeText = (value: unknown) => typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);
const positiveSafeInteger = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const freezeResult = <T extends LoadPlanResult>(result: T): T => Object.freeze(result);

function multiply(left: number, right: number): number | null {
  const value = left * right;
  return Number.isSafeInteger(value) ? value : null;
}

function add(left: number, right: number): number | null {
  const value = left + right;
  return Number.isSafeInteger(value) ? value : null;
}

function validateSnapshot(snapshot: PackagingSnapshot, productId: string): "valid" | "invalid" | "overflow" {
  if (!isProductIdentifier(snapshot.productId) || snapshot.productId !== productId || !safeText(snapshot.sku) || !safeText(snapshot.productName)) return "invalid";
  if (![snapshot.unitsPerPackage, snapshot.packagesPerPallet, snapshot.unitsPerPallet, snapshot.grossPalletWeightGrams].every(positiveSafeInteger)) return "invalid";
  const derived = multiply(snapshot.unitsPerPackage, snapshot.packagesPerPallet);
  if (derived === null) return "overflow";
  return derived === snapshot.unitsPerPallet ? "valid" : "invalid";
}

export function calculateLoadPlan(input: readonly LoadPlanInputLine[]): LoadPlanResult {
  if (input.length === 0) return freezeResult({status: "invalid_plan", reason: "empty_plan"});
  const seen = new Set<string>();
  for (const line of input) {
    if (!isProductIdentifier(line.productId) || seen.has(line.productId)) return freezeResult({status: "invalid_plan", reason: seen.has(line.productId) ? "duplicate_product" : "invalid_product_id"});
    seen.add(line.productId);
    if (!positiveSafeInteger(line.palletCount) || (line.palletCount as number) > maxRequestedPalletsPerLine) return freezeResult({status: "invalid_plan", reason: "invalid_pallet_count"});
  }
  const missing = input.filter((line) => !line.packaging).map((line) => line.productId);
  if (missing.length) return freezeResult({status: "insufficient_data", productIds: Object.freeze([...missing])});

  const lines: CalculatedLoadLine[] = [];
  let pallets = 0, packages = 0, bottleUnits = 0, grossWeightGrams = 0;
  for (const inputLine of input) {
    const snapshot = inputLine.packaging!;
    const validity = validateSnapshot(snapshot, inputLine.productId);
    if (validity === "overflow") return freezeResult({status: "arithmetic_overflow"});
    if (validity === "invalid") return freezeResult({status: "invalid_plan", reason: "invalid_packaging_snapshot"});
    const linePackages = multiply(inputLine.palletCount as number, snapshot.packagesPerPallet);
    const lineUnits = multiply(inputLine.palletCount as number, snapshot.unitsPerPallet);
    const lineWeight = multiply(inputLine.palletCount as number, snapshot.grossPalletWeightGrams);
    if (linePackages === null || lineUnits === null || lineWeight === null) return freezeResult({status: "arithmetic_overflow"});
    const nextPallets = add(pallets, inputLine.palletCount as number), nextPackages = add(packages, linePackages), nextUnits = add(bottleUnits, lineUnits), nextWeight = add(grossWeightGrams, lineWeight);
    if (nextPallets === null || nextPackages === null || nextUnits === null || nextWeight === null) return freezeResult({status: "arithmetic_overflow"});
    pallets = nextPallets; packages = nextPackages; bottleUnits = nextUnits; grossWeightGrams = nextWeight;
    lines.push(Object.freeze({packaging: Object.freeze({...snapshot}), palletCount: inputLine.palletCount as number, totalPackages: linePackages, totalBottleUnits: lineUnits, totalGrossWeightGrams: lineWeight}));
  }
  const palletExceeded = pallets > truckCapacityPolicy.maxPallets;
  const weightExceeded = grossWeightGrams > truckCapacityPolicy.maxGrossWeightGrams;
  const assessment = palletExceeded && weightExceeded ? "exceeds_pallet_and_weight_limits" : palletExceeded ? "exceeds_pallet_limit" : weightExceeded ? "exceeds_weight_limit" : "feasible";
  return Object.freeze({status: "calculated", assessment, lines: Object.freeze(lines), totals: Object.freeze({pallets, packages, bottleUnits, grossWeightGrams})});
}
