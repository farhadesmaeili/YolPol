import {
  aiToStaffTranslationModes,
  customerToStaffTranslationModes,
  staffToCustomerTranslationModes,
  type AiToStaffTranslationMode,
  type CustomerToStaffTranslationMode,
  type StaffToCustomerTranslationMode,
} from "@/features/conversation-translation/domain/types/translation-control";

type PolicyPayload = Readonly<{
  customerToStaffMode: CustomerToStaffTranslationMode;
  staffToCustomerMode: StaffToCustomerTranslationMode;
  aiToStaffMode: AiToStaffTranslationMode;
  expectedVersion: number;
}>;

export type TranslationControlPayload =
  | (PolicyPayload & Readonly<{action: "SET"}>)
  | Readonly<{action: "REMOVE"; expectedVersion: number}>;

export type TranslationControlPayloadResult =
  | Readonly<{status: "success"; value: TranslationControlPayload}>
  | Readonly<{status: "failure"; field: "request" | "action" | keyof PolicyPayload}>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectedVersion(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function parsePolicy(record: Record<string, unknown>): TranslationControlPayloadResult {
  if (typeof record.customerToStaffMode !== "string" || !(customerToStaffTranslationModes as readonly string[]).includes(record.customerToStaffMode)) return {status: "failure", field: "customerToStaffMode"};
  if (typeof record.staffToCustomerMode !== "string" || !(staffToCustomerTranslationModes as readonly string[]).includes(record.staffToCustomerMode)) return {status: "failure", field: "staffToCustomerMode"};
  if (typeof record.aiToStaffMode !== "string" || !(aiToStaffTranslationModes as readonly string[]).includes(record.aiToStaffMode)) return {status: "failure", field: "aiToStaffMode"};
  const version = expectedVersion(record.expectedVersion);
  if (version === null) return {status: "failure", field: "expectedVersion"};
  return {status: "success", value: {
    action: "SET",
    customerToStaffMode: record.customerToStaffMode as CustomerToStaffTranslationMode,
    staffToCustomerMode: record.staffToCustomerMode as StaffToCustomerTranslationMode,
    aiToStaffMode: record.aiToStaffMode as AiToStaffTranslationMode,
    expectedVersion: version,
  }};
}

export function parseTranslationControlPayload(value: unknown): TranslationControlPayloadResult {
  if (!plainRecord(value) || typeof value.action !== "string") return {status: "failure", field: "request"};
  if (value.action === "REMOVE") {
    if (Object.keys(value).sort().join(",") !== "action,expectedVersion") return {status: "failure", field: "request"};
    const version = expectedVersion(value.expectedVersion);
    return version === null ? {status: "failure", field: "expectedVersion"} : {status: "success", value: {action: "REMOVE", expectedVersion: version}};
  }
  if (value.action !== "SET") return {status: "failure", field: "action"};
  if (Object.keys(value).sort().join(",") !== "action,aiToStaffMode,customerToStaffMode,expectedVersion,staffToCustomerMode") return {status: "failure", field: "request"};
  return parsePolicy(value);
}

export function parseGlobalTranslationDefaultsPayload(value: unknown): TranslationControlPayloadResult {
  if (!plainRecord(value) || Object.keys(value).sort().join(",") !== "aiToStaffMode,customerToStaffMode,expectedVersion,staffToCustomerMode") return {status: "failure", field: "request"};
  return parsePolicy({...value, action: "SET"});
}
