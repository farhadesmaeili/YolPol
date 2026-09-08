import type {CustomerInquirySummaryDto} from "@/features/inquiries/application/dto/customer-inquiry-summary-dto";
import {inquiryUnits} from "@/features/inquiries/domain/types/inquiry-types";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseCustomerInquirySummary(value: unknown): CustomerInquirySummaryDto | null {
  if (!record(value) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.items) || !value.items.length) return null;
  if (value.details !== null && typeof value.details !== "string") return null;
  if (value.initialMessageId !== null && (typeof value.initialMessageId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/u.test(value.initialMessageId))) return null;
  if (value.destination !== null && (!record(value.destination) || (value.destination.country !== undefined && typeof value.destination.country !== "string") || (value.destination.city !== undefined && typeof value.destination.city !== "string"))) return null;
  const items: CustomerInquirySummaryDto["items"][number][] = [];
  for (const item of value.items) {
    if (!record(item) || typeof item.productId !== "string" || typeof item.name !== "string" || typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) return null;
    const unit = inquiryUnits.find((unit) => unit === item.unit);
    if (!unit) return null;
    items.push({productId: item.productId, name: item.name, quantity: item.quantity, unit});
  }
  return {createdAt: value.createdAt, items, details: value.details, initialMessageId: value.initialMessageId,
    destination: record(value.destination) ? {country: typeof value.destination.country === "string" ? value.destination.country : undefined, city: typeof value.destination.city === "string" ? value.destination.city : undefined} : null};
}

export async function loadCustomerInquirySummary(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CustomerInquirySummaryDto | null> {
  try {
    const response = await fetcher("/api/customer/conversation/summary", {signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), cache: "no-store", headers: {Accept: "application/json"}});
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return record(value) ? parseCustomerInquirySummary(value.summary) : null;
  } catch { return null; }
}
