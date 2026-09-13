import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";

export type InquiryProductSnapshotInput = Readonly<{productId: unknown; sku: unknown; slug: unknown; productName: unknown}>;
export type InquiryProductSnapshot = Readonly<{productId: string; sku: string; slug: string; productName: string}>;

const productIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/;
const skuPattern = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const unsafeSingleLine = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

export function normalizeInquiryProductId(value: unknown): string {
  if (typeof value !== "string" || !productIdPattern.test(value)) throw new InquiryValidationError("items.productId", "Invalid Product snapshot ID.");
  return value;
}

export function createInquiryProductSnapshot(input: InquiryProductSnapshotInput): InquiryProductSnapshot {
  const productId = normalizeInquiryProductId(input.productId);
  if (typeof input.sku !== "string" || !skuPattern.test(input.sku)) throw new InquiryValidationError("items.sku", "Invalid Product snapshot SKU.");
  if (typeof input.slug !== "string" || input.slug.length > 120 || !slugPattern.test(input.slug)) throw new InquiryValidationError("items.slug", "Invalid Product snapshot slug.");
  if (typeof input.productName !== "string" || input.productName.length < 2 || input.productName.length > 120 || input.productName !== input.productName.trim() || unsafeSingleLine.test(input.productName)) throw new InquiryValidationError("items.productName", "Invalid localized Product snapshot name.");
  return Object.freeze({productId, sku: input.sku, slug: input.slug, productName: input.productName});
}
