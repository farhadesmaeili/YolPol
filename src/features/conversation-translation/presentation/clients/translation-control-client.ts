import type {ConversationTranslationControlDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import {
  aiToStaffTranslationModes,
  customerToStaffTranslationModes,
  staffToCustomerTranslationModes,
  type ConversationTranslationPolicy,
} from "@/features/conversation-translation/domain/types/translation-control";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseControl(value: unknown): ConversationTranslationControlDto | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "aiToStaffMode,customerToStaffMode,staffToCustomerMode,version"
    || typeof value.customerToStaffMode !== "string" || !(customerToStaffTranslationModes as readonly string[]).includes(value.customerToStaffMode)
    || typeof value.staffToCustomerMode !== "string" || !(staffToCustomerTranslationModes as readonly string[]).includes(value.staffToCustomerMode)
    || typeof value.aiToStaffMode !== "string" || !(aiToStaffTranslationModes as readonly string[]).includes(value.aiToStaffMode)
    || !Number.isSafeInteger(value.version) || Number(value.version) < 0) return null;
  return value as unknown as ConversationTranslationControlDto;
}

export async function updateConversationTranslationControl(
  input: ConversationTranslationPolicy & Readonly<{inquiryId: string; expectedVersion: number}>,
  fetcher: typeof fetch = fetch,
): Promise<ConversationTranslationControlDto> {
  const response = await fetcher(`/api/staff/inquiries/${encodeURIComponent(input.inquiryId)}/translation-control`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      customerToStaffMode: input.customerToStaffMode,
      staffToCustomerMode: input.staffToCustomerMode,
      aiToStaffMode: input.aiToStaffMode,
      expectedVersion: input.expectedVersion,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);
  const value = isRecord(payload) ? parseControl(payload.value) : null;
  if (!response.ok || !value) throw new Error("translation_control_failed");
  return value;
}
