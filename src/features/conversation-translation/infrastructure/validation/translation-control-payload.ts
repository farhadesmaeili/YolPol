import {
  aiToStaffTranslationModes,
  customerToStaffTranslationModes,
  staffToCustomerTranslationModes,
  type AiToStaffTranslationMode,
  type CustomerToStaffTranslationMode,
  type StaffToCustomerTranslationMode,
} from "@/features/conversation-translation/domain/types/translation-control";

export type TranslationControlPayload = Readonly<{
  customerToStaffMode: CustomerToStaffTranslationMode;
  staffToCustomerMode: StaffToCustomerTranslationMode;
  aiToStaffMode: AiToStaffTranslationMode;
  expectedVersion: number;
}>;

export type TranslationControlPayloadResult =
  | Readonly<{status: "success"; value: TranslationControlPayload}>
  | Readonly<{status: "failure"; field: "request" | keyof TranslationControlPayload}>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseTranslationControlPayload(value: unknown): TranslationControlPayloadResult {
  if (!plainRecord(value) || Object.keys(value).sort().join(",") !== "aiToStaffMode,customerToStaffMode,expectedVersion,staffToCustomerMode") return {status: "failure", field: "request"};
  if (typeof value.customerToStaffMode !== "string" || !(customerToStaffTranslationModes as readonly string[]).includes(value.customerToStaffMode)) return {status: "failure", field: "customerToStaffMode"};
  if (typeof value.staffToCustomerMode !== "string" || !(staffToCustomerTranslationModes as readonly string[]).includes(value.staffToCustomerMode)) return {status: "failure", field: "staffToCustomerMode"};
  if (typeof value.aiToStaffMode !== "string" || !(aiToStaffTranslationModes as readonly string[]).includes(value.aiToStaffMode)) return {status: "failure", field: "aiToStaffMode"};
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) return {status: "failure", field: "expectedVersion"};
  return {status: "success", value: {
    customerToStaffMode: value.customerToStaffMode as CustomerToStaffTranslationMode,
    staffToCustomerMode: value.staffToCustomerMode as StaffToCustomerTranslationMode,
    aiToStaffMode: value.aiToStaffMode as AiToStaffTranslationMode,
    expectedVersion: Number(value.expectedVersion),
  }};
}
