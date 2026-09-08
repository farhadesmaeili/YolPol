import type {ConversationTranslationControlDto, GlobalTranslationDefaultsDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import {aiToStaffTranslationModes, customerToStaffTranslationModes, staffToCustomerTranslationModes, type ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePolicy(value: unknown, withVersion: boolean): (ConversationTranslationPolicy & Readonly<{version?: number}>) | null {
  if (!isRecord(value)
    || typeof value.customerToStaffMode !== "string" || !(customerToStaffTranslationModes as readonly string[]).includes(value.customerToStaffMode)
    || typeof value.staffToCustomerMode !== "string" || !(staffToCustomerTranslationModes as readonly string[]).includes(value.staffToCustomerMode)
    || typeof value.aiToStaffMode !== "string" || !(aiToStaffTranslationModes as readonly string[]).includes(value.aiToStaffMode)
    || (withVersion && (!Number.isSafeInteger(value.version) || Number(value.version) < 0))) return null;
  return value as ConversationTranslationPolicy & Readonly<{version?: number}>;
}

function parseControl(value: unknown): ConversationTranslationControlDto | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "effective,globalDefaults,override,source") return null;
  const globalDefaults = parsePolicy(value.globalDefaults, true);
  const override = value.override === null ? null : parsePolicy(value.override, true);
  const effective = parsePolicy(value.effective, false);
  if (!globalDefaults || (value.override !== null && !override) || !effective || (value.source !== "GLOBAL" && value.source !== "OVERRIDE")) return null;
  return value as ConversationTranslationControlDto;
}

function parseGlobal(value: unknown): GlobalTranslationDefaultsDto | null {
  const parsed = parsePolicy(value, true);
  return parsed ? parsed as GlobalTranslationDefaultsDto : null;
}

async function update<T>(url: string, body: Readonly<Record<string, unknown>>, parser: (value: unknown) => T | null, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const payload: unknown = await response.json().catch(() => null);
  const value = isRecord(payload) ? parser(payload.value) : null;
  if (!response.ok || !value) throw new Error("translation_settings_failed");
  return value;
}

export function setConversationTranslationOverride(input: ConversationTranslationPolicy & Readonly<{inquiryId: string; expectedVersion: number}>, fetcher: typeof fetch = fetch) {
  return update(`/api/staff/inquiries/${encodeURIComponent(input.inquiryId)}/translation-control`, {
    action: "SET", customerToStaffMode: input.customerToStaffMode, staffToCustomerMode: input.staffToCustomerMode,
    aiToStaffMode: input.aiToStaffMode, expectedVersion: input.expectedVersion,
  }, parseControl, fetcher);
}

export function removeConversationTranslationOverride(input: Readonly<{inquiryId: string; expectedVersion: number}>, fetcher: typeof fetch = fetch) {
  return update(`/api/staff/inquiries/${encodeURIComponent(input.inquiryId)}/translation-control`, {action: "REMOVE", expectedVersion: input.expectedVersion}, parseControl, fetcher);
}

export function updateGlobalTranslationDefaults(input: ConversationTranslationPolicy & Readonly<{expectedVersion: number}>, fetcher: typeof fetch = fetch) {
  return update("/api/staff/translation-settings", {
    customerToStaffMode: input.customerToStaffMode,
    staffToCustomerMode: input.staffToCustomerMode,
    aiToStaffMode: input.aiToStaffMode,
    expectedVersion: input.expectedVersion,
  }, parseGlobal, fetcher);
}
