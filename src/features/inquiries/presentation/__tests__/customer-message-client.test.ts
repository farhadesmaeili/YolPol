import {describe, expect, it, vi} from "vitest";

import {loadCustomerMessageHistory, sendCustomerMessage} from "@/features/inquiries/presentation/clients/customer-message-client";

const signal = new AbortController().signal;
const json = (value: unknown, status: number) => new Response(JSON.stringify(value), {status, headers: {"Content-Type": "application/json"}});

describe("Customer message client", () => {
  it("posts only the public message contract and accepts the exact success response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({status: "created", messageId: "message_1"}, 201));

    await expect(sendCustomerMessage({message: "Please send an update."}, signal, fetcher)).resolves.toEqual({status: "created", messageId: "message_1"});
    expect(fetcher).toHaveBeenCalledWith("/api/customer/conversation/messages", {
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
    const result = await sendCustomerMessage({message: "Hello"}, signal, fetcher);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/internal|database|field|code/u);
  });

  it("maps network failures without leaking the thrown error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private network detail"));
    const result = await sendCustomerMessage({message: "Hello"}, signal, fetcher);
    expect(result).toEqual({status: "network_error"});
    expect(JSON.stringify(result)).not.toContain("private network detail");
  });

  it.each([
    json({status: "created", messageId: "message_1", conversationId: "hidden"}, 201),
    json({status: "created", messageId: "bad/id"}, 201),
    new Response("created", {status: 201, headers: {"Content-Type": "text/plain"}}),
  ])("rejects malformed success responses", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(sendCustomerMessage({message: "Hello"}, signal, fetcher)).resolves.toEqual({status: "unavailable"});
  });

  it("never places a customer capability in the request URL or body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({status: "created", messageId: "message_1"}, 201));
    await sendCustomerMessage({message: "Hello"}, signal, fetcher);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("ypc_");
  });
});

describe("Customer message history client", () => {
  it("retains durable positions after skips and rejects duplicate or descending cursors", async () => {
    const message = (position: number) => ({id: `message_${position}`, position, senderType: "CUSTOMER", channel: "WEBSITE", body: "Safe message", createdAt: "2026-08-25T08:00:00.000Z"});
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({messages: [message(10), message(12), message(13)]}, 200));
    expect(await loadCustomerMessageHistory(signal, fetcher)).toMatchObject({status: "loaded", messages: [{position: 10}, {position: 12}, {position: 13}]});
    for (const positions of [[10, 10], [12, 10], [10, -1]]) {
      fetcher.mockResolvedValueOnce(json({messages: positions.map(message)}, 200));
      expect(await loadCustomerMessageHistory(signal, fetcher)).toEqual({status: "unavailable"});
    }
  });
  const history = {messages: [
    {id: "message_1", senderType: "CUSTOMER", channel: "WEBSITE", body: "Customer update", createdAt: "2026-08-25T08:00:00.000Z"},
    {id: "message_2", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Support response", createdAt: "2026-08-25T08:05:00.000Z"},
  ]};

  it("loads and maps the exact ordered history contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(history, 200));
    await expect(loadCustomerMessageHistory(signal, fetcher)).resolves.toEqual({status: "loaded", messages: [
      {id: "message_1", body: "Customer update", sender: "customer"},
      {id: "message_2", body: "Support response", sender: "support"},
    ]});
    expect(fetcher).toHaveBeenCalledWith("/api/customer/conversation", {method: "GET", headers: {Accept: "application/json"}, signal});
  });

  it("accepts an empty Conversation history", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({messages: []}, 200));
    await expect(loadCustomerMessageHistory(signal, fetcher)).resolves.toEqual({status: "loaded", messages: []});
  });

  it.each([
    [json({status: "error", code: "conversation_not_found"}, 404), {status: "unavailable"}],
    [json({status: "error", code: "unauthorized"}, 401), {status: "unauthorized"}],
    [json({status: "error", code: "rate_limited"}, 429), {status: "rate_limited"}],
    [json({status: "error", code: "service_unavailable", detail: "database secret"}, 503), {status: "unavailable"}],
    [json({...history, conversationId: "hidden"}, 200), {status: "unavailable"}],
    [json({messages: [{...history.messages[0], internalMetadata: "hidden"}]}, 200), {status: "unavailable"}],
  ] as const)("maps unsafe or failed history responses safely", async (response, expected) => {
    const result = await loadCustomerMessageHistory(signal, vi.fn<typeof fetch>().mockResolvedValue(response));
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toMatch(/database|secret|conversationId|internalMetadata/u);
  });

  it("maps network errors without exposing private details", async () => {
    const failingFetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private network detail"));
    await expect(loadCustomerMessageHistory(signal, failingFetcher)).resolves.toEqual({status: "network_error"});
  });
});
