import {describe, expect, it} from "vitest";

import {SubmitIndexNow} from "@/features/indexnow/application/use-cases/submit-indexnow";
import {parseIndexNowKey} from "@/features/indexnow/domain/value-objects/indexnow-key";
import {FakeIndexNowGateway} from "@/features/indexnow/testing/fakes/fake-indexnow-gateway";

const key = parseIndexNowKey("synthetic-key-123");

function createUseCase(urls: readonly string[], gateway = new FakeIndexNowGateway()) {
  return {
    gateway,
    useCase: new SubmitIndexNow(
      {listIndexableUrls: async () => urls},
      {readKey: async () => key},
      gateway,
      "https://yolpol.com",
      "https://yolpol.com/indexnow-key.txt",
    ),
  };
}

describe("SubmitIndexNow", () => {
  it("deduplicates and sorts the canonical URL list deterministically", async () => {
    const {gateway, useCase} = createUseCase([
      "https://yolpol.com/tr/products",
      "https://yolpol.com/en",
      "https://yolpol.com/tr/products",
    ]);

    await expect(useCase.execute("production")).resolves.toEqual({
      receipt: "submitted",
      submittedUrlCount: 2,
      batchCount: 1,
    });
    expect(gateway.requests).toEqual([{
      host: "yolpol.com",
      key,
      keyLocation: "https://yolpol.com/indexnow-key.txt",
      urlList: ["https://yolpol.com/en", "https://yolpol.com/tr/products"],
    }]);
  });

  it("batches more than 10,000 URLs without exceeding the protocol maximum", async () => {
    const urls = Array.from({length: 10_001}, (_, index) => `https://yolpol.com/en/catalog-${String(index).padStart(5, "0")}`);
    const {gateway, useCase} = createUseCase(urls);

    await expect(useCase.execute("production")).resolves.toMatchObject({
      submittedUrlCount: 10_001,
      batchCount: 2,
    });
    expect(gateway.requests.map(({urlList}) => urlList.length)).toEqual([10_000, 1]);
  });

  it.each(["staging", "development", "test"])("rejects the %s environment before reading URLs or keys", async (environment) => {
    let accessed = false;
    const useCase = new SubmitIndexNow(
      {listIndexableUrls: async () => { accessed = true; return []; }},
      {readKey: async () => { accessed = true; return key; }},
      new FakeIndexNowGateway(),
      "https://yolpol.com",
      "https://yolpol.com/indexnow-key.txt",
    );

    await expect(useCase.execute(environment)).rejects.toMatchObject({code: "invalid_environment"});
    expect(accessed).toBe(false);
  });

  it("rejects an empty set, foreign host, and malformed URL before submission", async () => {
    await expect(createUseCase([]).useCase.execute("production")).rejects.toMatchObject({code: "empty_url_set"});
    await expect(createUseCase(["https://attacker.example/en"]).useCase.execute("production"))
      .rejects.toMatchObject({code: "invalid_url"});
    await expect(createUseCase(["not-a-url"]).useCase.execute("production"))
      .rejects.toMatchObject({code: "invalid_url"});
  });

  it("preserves accepted/pending key validation semantics", async () => {
    const {useCase} = createUseCase(
      ["https://yolpol.com/en"],
      new FakeIndexNowGateway("accepted_pending_key_validation"),
    );
    await expect(useCase.execute("production")).resolves.toMatchObject({
      receipt: "accepted_pending_key_validation",
    });
  });
});
