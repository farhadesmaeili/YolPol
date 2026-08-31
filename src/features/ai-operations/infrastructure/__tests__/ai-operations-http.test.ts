import {describe, expect, it, vi} from "vitest";

import {createAiOperationsAuditRequestHandler, createGetAiOperationsRequestHandler, createUpdateAiOperationsRequestHandler} from "@/features/ai-operations/infrastructure/http/ai-operations-request-handlers";

const principal = {staffAccountId: "account-1", teamMemberId: "member-1", role: "ADMIN" as const, displayName: "Admin", actorReference: "staff:member-1"};
const credential = "synthetic-session-credential";
const authenticatedRequest = (method = "GET", body?: unknown, origin = "https://yolpol.com") => new Request("http://localhost/api/staff/ai-operations", {
  method,
  headers: {Cookie: `yolpol_staff_session=${credential}`, ...(origin ? {Origin: origin} : {}), ...(body === undefined ? {} : {"Content-Type": "application/json"})},
  body: body === undefined ? undefined : JSON.stringify(body),
});

function fixtures() {
  const access = {resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal})}};
  const operations = {
    getPolicy: {execute: vi.fn().mockResolvedValue({status: "found", value: {policy: null, effectiveDecision: {allowed: false, reason: "POLICY_UNAVAILABLE"}, emergencyOverride: {active: false, state: "INACTIVE"}}})},
    updatePolicy: {execute: vi.fn().mockResolvedValue({status: "updated", policy: {version: 1}})},
    readAuditHistory: {execute: vi.fn().mockResolvedValue({status: "found", events: []})},
  };
  const rateLimiter = {consume: vi.fn().mockReturnValue({allowed: true})};
  const options = {rateLimiter, environment: {NODE_ENV: "development"}, approvedDevelopmentOrigins: new Set(["http://localhost"])};
  return {access, operations, rateLimiter, options};
}

const validBody = {expectedVersion: 0, mode: "DISABLED", businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: []};

describe("AI Operations Staff HTTP boundary", () => {
  it("requires the HttpOnly session for reads and rejects all query strings", async () => {
    const value = fixtures();
    const get = createGetAiOperationsRequestHandler(() => value.access, () => value.operations, value.options);
    expect((await get(new Request("http://localhost/api/staff/ai-operations"))).status).toBe(401);
    expect((await get(new Request("http://localhost/api/staff/ai-operations?actor=forged", {headers: {Cookie: `yolpol_staff_session=${credential}`}}))).status).toBe(400);
    expect(value.operations.getPolicy.execute).not.toHaveBeenCalled();
  });

  it("requires exact Origin, bounded JSON, exact keys, and never accepts a browser actor", async () => {
    const value = fixtures();
    const update = createUpdateAiOperationsRequestHandler(() => value.access, () => value.operations, value.options);
    expect((await update(authenticatedRequest("PUT", validBody, ""))).status).toBe(403);
    expect((await update(authenticatedRequest("PUT", {...validBody, actorReference: "staff:attacker"}))).status).toBe(400);
    const tooLarge = authenticatedRequest("PUT", validBody);
    tooLarge.headers.set("Content-Length", String(33 * 1_024));
    expect((await update(tooLarge)).status).toBe(413);
    expect(value.operations.updatePolicy.execute).not.toHaveBeenCalled();
  });

  it("passes only validated policy fields with the session principal and maps optimistic conflicts", async () => {
    const value = fixtures();
    const update = createUpdateAiOperationsRequestHandler(() => value.access, () => value.operations, value.options);
    expect((await update(authenticatedRequest("PUT", validBody))).status).toBe(200);
    expect(value.operations.updatePolicy.execute).toHaveBeenCalledWith({...validBody, principal});
    value.operations.updatePolicy.execute.mockResolvedValueOnce({status: "conflict"});
    const response = await update(authenticatedRequest("PUT", validBody));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({code: "version_conflict"});
  });

  it("maps application capability denial without exposing role logic in the handler", async () => {
    const value = fixtures();
    value.operations.updatePolicy.execute.mockResolvedValueOnce({status: "forbidden"});
    const update = createUpdateAiOperationsRequestHandler(() => value.access, () => value.operations, value.options);
    expect((await update(authenticatedRequest("PUT", validBody))).status).toBe(403);
  });

  it("rate limits mutation attempts and protects audit history with the same session boundary", async () => {
    const value = fixtures();
    value.rateLimiter.consume.mockReturnValueOnce({allowed: false, retryAfterSeconds: 12});
    const update = createUpdateAiOperationsRequestHandler(() => value.access, () => value.operations, value.options);
    const limited = await update(authenticatedRequest("PUT", validBody));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("12");
    const audit = createAiOperationsAuditRequestHandler(() => value.access, () => value.operations, value.options);
    expect((await audit(authenticatedRequest())).status).toBe(200);
    expect(value.operations.readAuditHistory.execute).toHaveBeenCalledWith(principal);
  });

  it("returns safe service errors without leaking dependency details", async () => {
    const value = fixtures();
    value.access.resolveSession.execute.mockRejectedValueOnce(new Error("postgres internal detail"));
    const get = createGetAiOperationsRequestHandler(() => value.access, () => value.operations, value.options);
    const response = await get(authenticatedRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("postgres internal detail");
    value.operations.getPolicy.execute.mockRejectedValueOnce(new Error("repository connection detail"));
    const dependencyResponse = await get(authenticatedRequest());
    expect(dependencyResponse.status).toBe(503);
    expect(await dependencyResponse.text()).not.toContain("repository connection detail");
  });
});
