import {conversationAiControlStates, type ConversationAiControlState} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export type ConversationAiControlPayloadResult = Readonly<{status: "success"; value: Readonly<{state: ConversationAiControlState; expectedVersion: number}>}>
  | Readonly<{status: "failure"; field: "request" | "state" | "expectedVersion"}>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseConversationAiControlPayload(value: unknown): ConversationAiControlPayloadResult {
  if (!plainRecord(value) || Object.keys(value).sort().join(",") !== "expectedVersion,state") return {status: "failure", field: "request"};
  if (typeof value.state !== "string" || !(conversationAiControlStates as readonly string[]).includes(value.state)) return {status: "failure", field: "state"};
  if (!Number.isSafeInteger(value.expectedVersion) || (value.expectedVersion as number) < 0) return {status: "failure", field: "expectedVersion"};
  return {status: "success", value: {state: value.state as ConversationAiControlState, expectedVersion: value.expectedVersion as number}};
}
