import {describe, expect, it, vi} from "vitest";

import {sendCustomerMessage} from "@/features/inquiries/presentation/clients/customer-message-client";

const signal = new AbortController().signal;
const json = (value: unknown, status: number) => new Response(JSON.stringify(value), {status, headers: {"Content-Type": "application/json"}});

describe("Customer message client", () => {
  it("posts only the public message contract and accepts the exact success response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({status: "created", messageId: "message_1"}, 201));

    await expect(sendCustomerMessage({inquiryId: "inquiry_1", message: "Please send an update."}, signal, fetcher)).resolves.toEqual({status: "created", messageId: "message_1"});
    expect(fetcher).toHaveBeenCalledWith("/api/inquiries/inquiry_1/messages", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: "Please send an update."}),
      signal,
    });
  });

  it.each([
    [json({status: "error", code: "validation_failed", field: "message", detail: "internal"}, 422), {status: "validation_error"}],
    [json({status: "error", code: "rate_limited", detail: "internal"}, 429), {status: "rate_limited"}],
    [json({status: "error", code: "service_unavailable", detail: "database secret"}, 503), {status: "unavailable"}],
  ] as const)("maps API failures to safe presentation results", async (response, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = await sendCustomerMessage({inquiryId: "inquiry_1", message: "Hello"}, signal, fetcher);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/internal|database|field|code/u);
  });

  it("maps network failures without leaking the thrown error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private network detail"));
    const result = await sendCustomerMessage({inquiryId: "inquiry_1", message: "Hello"}, signal, fetcher);
    expect(result).toEqual({status: "network_error"});
    expect(JSON.stringify(result)).not.toContain("private network detail");
  });

  it.each([
    json({status: "created", messageId: "message_1", conversationId: "hidden"}, 201),
    json({status: "created", messageId: "bad/id"}, 201),
    new Response("created", {status: 201, headers: {"Content-Type": "text/plain"}}),
  ])("rejects malformed success responses", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(sendCustomerMessage({inquiryId: "inquiry_1", message: "Hello"}, signal, fetcher)).resolves.toEqual({status: "unavailable"});
  });

  it("does not request an unsafe inquiry path", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(sendCustomerMessage({inquiryId: "../private", message: "Hello"}, signal, fetcher)).resolves.toEqual({status: "unavailable"});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
