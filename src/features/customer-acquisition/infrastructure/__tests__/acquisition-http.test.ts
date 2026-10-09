import {randomBytes} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {CustomerAcquisition} from "@/features/customer-acquisition/application/use-cases/customer-acquisition";
import type {AcquisitionRepository} from "@/features/customer-acquisition/application/ports/acquisition-repository";
import {createAcquisitionHandler} from "@/features/customer-acquisition/infrastructure/http/acquisition-handler";
import {presentAcquisitionResult} from "@/features/customer-acquisition/presentation/presenters/acquisition-result-presenter";
import {FixedWindowRateLimiter} from "@/shared/infrastructure/http/fixed-window-rate-limiter";
import {syntheticObservation} from "@/features/customer-acquisition/testing/fixtures/acquisition-fixtures";

function harness(maxRequests = 60) {
  const repository: AcquisitionRepository = {ingest: vi.fn(async () => ({status: "CREATED" as const, companyId: "opaque-id"})), qualify: vi.fn(), suppress: vi.fn(), release: vi.fn(), ready: vi.fn(async () => true)};
  const token = randomBytes(32).toString("hex"); const log = vi.fn();
  const handle = createAcquisitionHandler({application: new CustomerAcquisition(repository), token, requestId: () => "opaque-request", present: presentAcquisitionResult, log, limiter: new FixedWindowRateLimiter({maxRequests, windowMs: 60000})});
  const request = (body: unknown = syntheticObservation(), authorization = `Bearer ${token}`) => new Request("http://internal/v1/observations", {method: "POST", headers: {authorization, "content-type": "application/json"}, body: JSON.stringify(body)});
  return {repository, token, log, handle, request};
}
describe("private acquisition API", () => {
  it.each([
    {company: {name: "\u0130".repeat(160), country: "TR", domain: "bottler.example"}},
    {company: {name: "\u0344".repeat(160), country: "TR", domain: "bottler.example"}},
    {contact: {name: "\u0344".repeat(160), email: "test@bottler.example"}},
    {company: {name: `${"A".repeat(159)}\u0130`, country: "TR", domain: "bottler.example"}},
  ])("ACQ-01 rejects expanded values before persistence with a safe 400", async (overrides) => {
    const h = harness();
    const response = await h.handle(h.request(syntheticObservation(overrides)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({requestId: "opaque-request", error: "INVALID_REQUEST"});
    expect(h.repository.ingest).not.toHaveBeenCalled();
    expect(h.log.mock.calls).toEqual([[{requestId: "opaque-request", status: 400, durationMs: expect.any(Number)}]]);
  });
  it("authenticates before parsing and never logs payloads", async () => {
    const h = harness(); expect((await h.handle(h.request(undefined, "wrong"))).status).toBe(401);
    expect(h.repository.ingest).not.toHaveBeenCalled();
    const response = await h.handle(h.request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({requestId: "opaque-request", status: "CREATED", companyId: "opaque-id"});
    const logged = JSON.stringify(h.log.mock.calls);
    for (const secret of [h.token, "bottler.example", "Synthetic Olive", "Authorization"]) expect(logged).not.toContain(secret);
  });
  it("bounds bodies, validates types and rejects pricing", async () => {
    const h = harness();
    expect((await h.handle(h.request({padding: "x".repeat(8193)}))).status).toBe(413);
    expect((await h.handle(h.request({...syntheticObservation(), internalPrice: 12}))).status).toBe(400);
    const request = h.request(); request.headers.set("content-type", "text/plain");
    expect((await h.handle(request)).status).toBe(415);
    expect(h.repository.ingest).not.toHaveBeenCalled();
  });
  it("rate limits authentication attempts with bounded safe errors", async () => {
    const h = harness(1);
    expect((await h.handle(h.request(undefined, "bad"))).status).toBe(401);
    expect((await h.handle(h.request())).status).toBe(429);
  });
  it("returns neutral unavailable errors and opaque health", async () => {
    const h = harness();
    vi.mocked(h.repository.ingest).mockRejectedValue(new Error(`postgres secret ${h.token}`));
    const response = await h.handle(h.request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({requestId: "opaque-request", error: "UNAVAILABLE"});
    expect(await (await h.handle(new Request("http://internal/health/ready"))).json()).toEqual({status: "ok"});
    vi.mocked(h.repository.ready).mockResolvedValue(false);
    expect((await h.handle(new Request("http://internal/health/ready"))).status).toBe(503);
  });
});
