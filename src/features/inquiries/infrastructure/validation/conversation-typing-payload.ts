export type ConversationTypingPayloadParseResult =
  | Readonly<{status: "success"; value: Readonly<{isTyping: boolean}>}>
  | Readonly<{status: "failure"; field: "request" | "isTyping"}>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseConversationTypingPayload(value: unknown): ConversationTypingPayloadParseResult {
  if (!plainRecord(value)) return {status: "failure", field: "request"};
  if (Object.keys(value).some((key) => key !== "isTyping")) return {status: "failure", field: "request"};
  if (typeof value.isTyping !== "boolean") return {status: "failure", field: "isTyping"};
  return {status: "success", value: {isTyping: value.isTyping}};
}
