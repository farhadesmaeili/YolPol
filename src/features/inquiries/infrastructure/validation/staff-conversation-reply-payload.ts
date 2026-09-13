export type StaffConversationReplyPayloadParseResult =
  | Readonly<{status: "success"; value: Readonly<{body: string; clientMessageId: string}>}>
  | Readonly<{status: "failure"; field: "request" | "body" | "clientMessageId"}>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseStaffConversationReplyPayload(value: unknown): StaffConversationReplyPayloadParseResult {
  if (!plainRecord(value)) return {status: "failure", field: "request"};
  if (Object.keys(value).some((key) => key !== "body" && key !== "clientMessageId")) {
    return {status: "failure", field: "request"};
  }
  if (typeof value.body !== "string") return {status: "failure", field: "body"};
  if (typeof value.clientMessageId !== "string") return {status: "failure", field: "clientMessageId"};
  return {status: "success", value: {body: value.body, clientMessageId: value.clientMessageId}};
}
