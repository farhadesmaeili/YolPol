import {describe, expect, it, vi} from "vitest";

import {parseIndexNowKey} from "@/features/indexnow/domain/value-objects/indexnow-key";
import {parseCanonicalIndexNowUrl} from "@/features/indexnow/domain/value-objects/indexnow-url";
import {
  FetchIndexNowGateway,
  indexNowEndpoint,
} from "@/features/indexnow/infrastructure/http/fetch-indexnow-gateway";

const syntheticKey = parseIndexNowKey("synthetic-key-123");
const request = {
  host: "yolpol.com",
  key: syntheticKey,
  keyLocation: "https://yolpol.com/indexnow-key.txt",
  urlList: [parseCanonicalIndexNowUrl("https://yolpol.com/en", "https://yolpol.com")],
} as const;

describe("FetchIndexNowGateway", () => {
  it.each([
    [200, "submitted"],
    [202, "accepted_pending_key_validation"],
  ] as const)("classifies HTTP %i receipt", async (status, receipt) => {
    const fetchClient = vi.fn(async () => ({status}));
    await expect(new FetchIndexNowGateway(fetchClient).submit(request)).resolves.toBe(receipt);
    expect(fetchClient).toHaveBeenCalledOnce();
    expect(fetchClient).toHaveBeenCalledWith(indexNowEndpoint, expect.objectContaining({
      method: "POST",
      headers: {"Content-Type": "application/json; charset=utf-8"},
      body: JSON.stringify(request),
      redirect: "error",
    }));
  });

  it.each([
    [400, "bad_request"],
    [403, "forbidden"],
    [422, "unprocessable_urls"],
    [429, "rate_limited"],
    [500, "provider_failure"],
    [503, "provider_failure"],
    [204, "unexpected_response"],
  ] as const)("classifies HTTP %i safely", async (status, code) => {
    const failure = await new FetchIndexNowGateway(async () => ({status})).submit(request)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({code});
    expect(String(failure)).not.toContain(syntheticKey);
  });

  it("classifies network failures without leaking transport details", async () => {
    const failure = await new FetchIndexNowGateway(async () => {
      throw new Error(`network detail ${syntheticKey}`);
    }).submit(request).catch((error: unknown) => error);
    expect(failure).toMatchObject({code: "network_failure"});
    expect(String(failure)).not.toContain(syntheticKey);
  });

  it("fails closed on redirect rejection without leaking transport details", async () => {
    const fetchClient = vi.fn(async (_input: string, init: {redirect: "error"}) => {
      expect(init.redirect).toBe("error");
      throw new Error(`redirect detail ${syntheticKey}`);
    });
    const failure = await new FetchIndexNowGateway(fetchClient).submit(request)
      .catch((error: unknown) => error);
    expect(fetchClient).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({code: "network_failure"});
    expect(String(failure)).not.toContain(syntheticKey);
  });

  it("aborts a bounded request and classifies the timeout", async () => {
    const fetchClient = vi.fn((_input: string, init: {signal: AbortSignal}) => new Promise<never>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
    }));
    await expect(new FetchIndexNowGateway(fetchClient, 1).submit(request))
      .rejects.toMatchObject({code: "timeout"});
  });
});
