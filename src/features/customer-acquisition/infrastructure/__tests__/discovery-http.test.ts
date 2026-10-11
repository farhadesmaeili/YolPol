import {randomBytes, randomUUID} from "node:crypto";
import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it, vi} from "vitest";
import {CompanyDiscovery} from "@/features/customer-acquisition/application/use-cases/company-discovery";
import {discoveryEligibility} from "@/features/customer-acquisition/domain/services/discovery-eligibility";
import type {CandidateStatus} from "@/features/customer-acquisition/application/ports/discovery-repository";
import type {DiscoveryRepository} from "@/features/customer-acquisition/application/ports/discovery-repository";
import {loadDiscoveryAuthentication} from "@/features/customer-acquisition/infrastructure/config/discovery-auth-config";
import {createDiscoveryHandler} from "@/features/customer-acquisition/infrastructure/http/discovery-handler";
import {parseDiscoveryBatch, parseDiscoveryEvidence, parseDiscoveryReview} from "@/features/customer-acquisition/infrastructure/validation/discovery-input";
import {presentDiscoveryBatch, presentDiscoveryQueue, presentDiscoveryReceipt} from "@/features/customer-acquisition/presentation/presenters/discovery-result-presenter";
import {fixtureBatch, fixtureCandidate} from "@/features/customer-acquisition/testing/fixtures/discovery-fixtures";
import {FixedWindowRateLimiter} from "@/shared/infrastructure/http/fixed-window-rate-limiter";
import {createAcquisitionHttpServer} from "../../../../../tooling/customer-acquisition/api";

function harness(run: (h: ReturnType<typeof createHarness>) => Promise<void> | void) {
  const directory = mkdtempSync(join(tmpdir(), "discovery-auth-test-"));
  return Promise.resolve().then(() => run(createHarness(directory))).finally(() => rmSync(directory, {recursive: true, force: true}));
}
function createHarness(directory: string) {
  const old = randomBytes(32).toString("hex");
  const bindings = {intake: {principalId: randomUUID(), token: randomBytes(32).toString("hex")}, reviewer: {principalId: randomUUID(), token: randomBytes(32).toString("hex")}};
  const path = join(directory, "bindings.json"); writeFileSync(path, JSON.stringify(bindings), {mode: 0o600});
  const authenticate = loadDiscoveryAuthentication(path, old);
  const repository: DiscoveryRepository = {submit: vi.fn(async () => ({receiptId: randomUUID()})), batch: vi.fn(), queue: vi.fn(async () => ({candidates: [], nextCursor: null})),
    evidence: vi.fn(async () => ({receiptId: randomUUID()})), review: vi.fn(async () => ({receiptId: randomUUID()}))};
  const log = vi.fn(); const application = new CompanyDiscovery(repository);
  const handle = createDiscoveryHandler({application, authenticate, requestId: randomUUID, log,
    present: {receipt: presentDiscoveryReceipt, batch: presentDiscoveryBatch, queue: presentDiscoveryQueue}});
  const request = (path = "/v1/discovery/batches", token = bindings.intake.token, body: unknown = fixtureBatch(), method = "POST") => new Request(`http://private${path}`, {
    method, headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, ...(method === "GET" ? {} : {body: JSON.stringify(body)})});
  return {bindings, path, old, authenticate, repository, log, application, handle, request};
}
describe("discovery private authentication and HTTP", () => {
  it("accepts batches above 8 KiB through the shared bounded Node transport", () => harness(async h => {
    const server = createAcquisitionHttpServer(h.handle);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Test listener absent");
      const body = JSON.stringify({...fixtureBatch(), candidates: Array.from({length: 20}, (_, i) => ({...fixtureCandidate(i), name: "Synthetic ".repeat(15), url: `https://source.example/${"path".repeat(100)}-${i}`}))});
      expect(Buffer.byteLength(body)).toBeGreaterThan(8192);
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/discovery/batches`, {method: "POST", headers: {authorization: `Bearer ${h.bindings.intake.token}`, "content-type": "application/json"}, body});
      expect(response.status).toBe(200); await response.arrayBuffer();
      expect(server.maxConnections).toBe(32); expect(server.requestTimeout).toBe(10000);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  }));
  it("binds immutable identities and authenticates before consuming bodies", () => harness(async h => {
    const request = h.request(undefined, h.old); const read = vi.spyOn(request, "arrayBuffer");
    expect((await h.handle(request)).status).toBe(401); expect(read).not.toHaveBeenCalled(); expect(request.bodyUsed).toBe(false);
    expect(h.repository.submit).not.toHaveBeenCalled();
    expect((await h.handle(h.request())).status).toBe(200);
    expect(h.repository.submit).toHaveBeenCalledWith({id: h.bindings.intake.principalId, capability: "INTAKE"}, fixtureBatch());
    expect(JSON.stringify(h.log.mock.calls)).not.toMatch(/Synthetic|bottler|Bearer|fixture-run/);
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(h.bindings.intake.token);
  }));
  it("denies intake review and reviewer intake", () => harness(async h => {
    expect((await h.handle(h.request(`/v1/discovery/candidates/${randomUUID()}/reviews`))).status).toBe(403);
    expect((await h.handle(h.request(undefined, h.bindings.reviewer.token))).status).toBe(403);
    expect((await h.handle(h.request("/v1/discovery/review-queue", h.bindings.intake.token, null, "GET"))).status).toBe(403);
  }));
  it("derives reviewer attribution and rejects impersonation", () => harness(async h => {
    const id = randomUUID(); const value = {idempotencyKey: "review", expectedVersion: 0, decision: "REJECT", reason: "INSUFFICIENT_EVIDENCE", findingId: null};
    const path = `/v1/discovery/candidates/${id}/reviews`;
    expect((await h.handle(h.request(path, h.bindings.reviewer.token, {...value, reviewerId: randomUUID()}))).status).toBe(400);
    expect((await h.handle(h.request(path, h.bindings.reviewer.token, value))).status).toBe(200);
    expect(h.repository.review).toHaveBeenCalledWith({id: h.bindings.reviewer.principalId, capability: "REVIEW"}, id, value);
  }));
  it("bounds bodies, routes, pagination and fixed errors", () => harness(async h => {
    expect((await h.handle(h.request(undefined, undefined, {padding: "x".repeat(65537)}))).status).toBe(413);
    expect((await h.handle(h.request(`/v1/discovery/candidates/${randomUUID()}/evidence`, h.bindings.reviewer.token, {padding: "x".repeat(8193)}))).status).toBe(413);
    expect((await h.handle(h.request("/v1/discovery/promotions"))).status).toBe(404);
    expect((await h.handle(h.request("/v1/discovery/batches", undefined, null, "GET"))).status).toBe(405);
    expect((await h.handle(h.request("/v1/discovery/review-queue?limit=1000", h.bindings.reviewer.token, null, "GET"))).status).toBe(400);
    vi.mocked(h.repository.submit).mockRejectedValue(new Error("private payload"));
    const response = await h.handle(h.request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private payload");
  }));
  it("rejects missing, duplicate and malformed credential bindings", () => harness(h => {
    expect(loadDiscoveryAuthentication(undefined, h.old)(`Bearer ${h.old}`)).toBeNull();
    for (const config of [{...h.bindings, reviewer: h.bindings.intake}, {...h.bindings, intake: {...h.bindings.intake, token: h.old}},
      {...h.bindings, reviewer: {...h.bindings.reviewer, role: "admin"}}, {}]) {
      writeFileSync(h.path, JSON.stringify(config)); expect(() => loadDiscoveryAuthentication(h.path, h.old)).toThrow("configuration rejected");
    }
  }));
  it("rate limits rejected authentication attempts", () => harness(async h => {
    const handle = createDiscoveryHandler({application: h.application, authenticate: h.authenticate, requestId: randomUUID, log: h.log,
      present: {receipt: presentDiscoveryReceipt, batch: presentDiscoveryBatch, queue: presentDiscoveryQueue}, limiter: new FixedWindowRateLimiter({maxRequests: 1, windowMs: 60000})});
    expect((await handle(h.request(undefined, "wrong"))).status).toBe(401); expect((await handle(h.request())).status).toBe(429);
  }));
});
describe("strict synthetic discovery inputs and projections", () => {
  it("projects historical approval with explicit current ineligibility in batch and queue", () => {
    const candidate: CandidateStatus = {id: randomUUID(), state: "APPROVED", version: 1, expiresAt: "2026-10-10T00:00:00Z", expired: true, suppressed: false, policyAllowed: true,
      eligibility: discoveryEligibility({state: "APPROVED", evaluatedAt: "2026-10-11T00:00:00Z", expired: true, policyAllowed: true, suppressed: false, identityConflict: false, evidenceSatisfied: true})};
    expect(presentDiscoveryBatch({batchId: "batch", candidates: [candidate]}).candidates[0]).toEqual(candidate);
    expect(presentDiscoveryQueue({nextCursor: null, candidates: [{...candidate, name: "Synthetic", country: "TR", domain: "synthetic.example", segment: "beverage", evidence: [], matches: []}]}).candidates[0])
      .toMatchObject({state: "APPROVED", eligibility: {contract: "authorization-time-v1", status: "EXPIRED"}});
  });
  it.each([0, 21])("rejects batch count %s", count => expect(() => parseDiscoveryBatch({...fixtureBatch(), candidates: Array.from({length: count}, (_, i) => fixtureCandidate(i))})).toThrow());
  it("accepts 20 and rejects real domains, source URLs and post-normalization overflow", () => {
    expect(parseDiscoveryBatch({...fixtureBatch(), candidates: Array.from({length: 20}, (_, i) => fixtureCandidate(i))}).candidates).toHaveLength(20);
    for (const patch of [{domain: "business.com"}, {url: "https://business.com/"}, {name: "\u0344".repeat(160)}, {name: "\u0130".repeat(160)}]) {
      expect(() => parseDiscoveryBatch({...fixtureBatch(), candidates: [{...fixtureCandidate(), ...patch}]})).toThrow();
    }
  });
  it.each(["email", "phone", "contact", "html", "credentials", "price", "role", "capabilities"])("rejects %s fields", field => {
    expect(() => parseDiscoveryBatch({...fixtureBatch(), [field]: "forbidden"})).toThrow();
    expect(() => parseDiscoveryBatch({...fixtureBatch(), candidates: [{...fixtureCandidate(), [field]: "forbidden"}]})).toThrow();
  });
  it("requires explicit finding ownership for identity decisions", () => {
    expect(() => parseDiscoveryReview({idempotencyKey: "x", expectedVersion: 0, decision: "DUPLICATE", reason: "IDENTITY_REVIEWED", findingId: null})).toThrow();
    expect(() => parseDiscoveryEvidence({idempotencyKey: "x", expectedVersion: 0, kind: "RAW_HTML", finding: "SUPPORTS", url: "https://x.example/", observedAt: fixtureCandidate().observedAt, reference: "x"})).toThrow();
  });
  it("excludes injected payload fields from safe receipts", () => {
    const result = {receiptId: "opaque", name: "secret", state: "APPROVED"};
    expect(presentDiscoveryReceipt(result)).toEqual({receiptId: "opaque"});
  });
});
