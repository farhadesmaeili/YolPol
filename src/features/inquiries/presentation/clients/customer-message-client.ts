export type SendCustomerMessageInput = Readonly<{inquiryId: string; message: string}>;
export type SendCustomerMessageResult =
  | Readonly<{status: "created"; messageId: string}>
  | Readonly<{status: "validation_error"}>
  | Readonly<{status: "rate_limited"}>
  | Readonly<{status: "network_error"}>
  | Readonly<{status: "unavailable"}>;

const opaqueIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

function isExactCreatedResponse(value: unknown): value is Readonly<{status: "created"; messageId: string}> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(",") === "messageId,status"
    && record.status === "created"
    && typeof record.messageId === "string"
    && opaqueIdPattern.test(record.messageId);
}

async function parseCustomerMessageResponse(response: Response): Promise<SendCustomerMessageResult> {
  if (response.status === 422) return {status: "validation_error"};
  if (response.status === 429) return {status: "rate_limited"};
  if (response.status !== 201 || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return {status: "unavailable"};

  try {
    const value: unknown = await response.json();
    return isExactCreatedResponse(value) ? {status: "created", messageId: value.messageId} : {status: "unavailable"};
  } catch {
    return {status: "unavailable"};
  }
}

export async function sendCustomerMessage(
  input: SendCustomerMessageInput,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<SendCustomerMessageResult> {
  if (!opaqueIdPattern.test(input.inquiryId)) return {status: "unavailable"};

  try {
    const response = await fetcher(`/api/inquiries/${encodeURIComponent(input.inquiryId)}/messages`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: input.message}),
      signal,
    });
    return parseCustomerMessageResponse(response);
  } catch {
    return {status: "network_error"};
  }
}
