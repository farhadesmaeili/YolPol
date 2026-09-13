import {maxRequestedPalletsPerLine} from "@/features/export-logistics/domain/types/load-plan";
import {isProductIdentifier} from "@/features/export-logistics/domain/validation/product-identifier";

export type ValidatedLoadSelectionLine = Readonly<{productId: string; palletCount: number}>;
export type LoadPlanRequestValidation =
  | Readonly<{status: "valid"; lines: readonly ValidatedLoadSelectionLine[]}>
  | Readonly<{status: "invalid"; reason: string}>;

export function validateLoadPlanRequest(input: unknown): LoadPlanRequestValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {status: "invalid", reason: "invalid_request"};
  const lines = (input as {lines?: unknown}).lines;
  if (!Array.isArray(lines) || lines.length === 0) return {status: "invalid", reason: "empty_plan"};
  const validated: ValidatedLoadSelectionLine[] = [];
  const productIds = new Set<string>();
  for (const value of lines) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {status: "invalid", reason: "invalid_line"};
    const {productId, palletCount} = value as {productId?: unknown; palletCount?: unknown};
    if (!isProductIdentifier(productId)) return {status: "invalid", reason: "invalid_product_id"};
    if (productIds.has(productId)) return {status: "invalid", reason: "duplicate_product"};
    if (typeof palletCount !== "number" || !Number.isSafeInteger(palletCount) || palletCount <= 0 || palletCount > maxRequestedPalletsPerLine) return {status: "invalid", reason: "invalid_pallet_count"};
    productIds.add(productId);
    validated.push(Object.freeze({productId, palletCount}));
  }
  return Object.freeze({status: "valid", lines: Object.freeze(validated)});
}
