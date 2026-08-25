export type CustomerMessagePayloadParseResult =
  | Readonly<{status: "success"; value: Readonly<{message: string}>}>
  | Readonly<{status: "failure"; field: "request" | "message"}>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseCustomerMessagePayload(value: unknown): CustomerMessagePayloadParseResult {
  if (!plainRecord(value)) return {status: "failure", field: "request"};
  if (Object.keys(value).some((key) => key !== "message")) return {status: "failure", field: "request"};
  if (typeof value.message !== "string") return {status: "failure", field: "message"};
  return {status: "success", value: {message: value.message}};
}
