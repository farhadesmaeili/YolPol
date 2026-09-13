import {describe, expect, it, vi} from "vitest";

import {createStaffLoginRequestHandler, createStaffLogoutRequestHandler, createStaffSessionRequestHandler, staffLoginRequestSizeLimit} from "@/features/staff-authentication/infrastructure/http/staff-authentication-request-handlers";
import {StaffLoginRateLimiter, parseStaffLoginRateLimitConfig} from "@/features/staff-authentication/infrastructure/http/staff-login-rate-limiter";
import {readStaffSessionCookie, serializeClearedStaffSessionCookie, serializeStaffSessionCookie, staffSessionCookieName} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {supportedLocales} from "@/shared/types/locale";

const credential = `yps_${"A".repeat(43)}`;
const expiresAt = new Date("2026-08-25T18:00:00.000Z");
const principal = {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES" as const, displayName: "Staff Member", actorReference: "staff:member-1"};
const production = {NODE_ENV: "production"};

function loginRequest(body: BodyInit = JSON.stringify({email: "staff@example.com", password: "password"}), headers: HeadersInit = {}): Request {
  return new Request("https://yolpol.com/api/staff/auth/login", {method: "POST", body, headers: {Origin: "https://yolpol.com", "Content-Type": "application/json", ...headers}});
}

function formLoginRequest(body = "email=staff%40example.com&password=password", headers: HeadersInit = {}): Request {
  return new Request("https://yolpol.com/api/staff/auth/login", {method: "POST", body, headers: {Origin: "https://yolpol.com", "Content-Type": "application/x-www-form-urlencoded", ...headers}});
}

describe("Staff login HTTP boundary", () => {
  it("sets a bounded production __Host cookie and never returns the raw credential", async () => {
    const execute = vi.fn().mockResolvedValue({status: "authenticated", principal, sessionCredential: credential, expiresAt});
    const response = await createStaffLoginRequestHandler(() => ({execute}), {environment: production})(loginRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain(`__Host-yolpol_staff_session=${credential}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Domain=");
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain(credential);
    expect(JSON.parse(body)).toEqual({status: "authenticated", principal: {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Staff Member"}});
  });

  it("normalizes a native URL-encoded POST into the same login input, cookie, and safe browser redirect", async () => {
    const execute = vi.fn().mockResolvedValue({status: "authenticated", principal, sessionCredential: credential, expiresAt});
    const response = await createStaffLoginRequestHandler(() => ({execute}), {environment: production})(formLoginRequest());
    expect(execute).toHaveBeenCalledWith({email: "staff@example.com", password: "password"});
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/staff");
    expect(response.headers.get("Location")).not.toMatch(/[?#]/u);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toContain(`__Host-yolpol_staff_session=${credential}`);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(await response.text()).toBe("");
  });

  it.each(supportedLocales)("preserves the supported %s locale in a same-origin native login redirect", async (locale) => {
    const execute = vi.fn().mockResolvedValue({status: "authenticated", principal, sessionCredential: credential, expiresAt});
    const response = await createStaffLoginRequestHandler(() => ({execute}), {environment: production})(
      formLoginRequest(`email=staff%40example.com&password=password&locale=${locale}`),
    );
    expect(execute).toHaveBeenCalledWith({email: "staff@example.com", password: "password"});
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(`/${locale}/staff`);
    expect(response.headers.get("Location")).not.toMatch(/[?#]|^\/\//u);
    expect(response.headers.get("Set-Cookie")).toContain(`__Host-yolpol_staff_session=${credential}`);
  });

  it.each(["unknown", "*", "%2F%2Fevil.example", "https%3A%2F%2Fevil.example"])("falls back to the safe default Staff route for invalid native locale input: %s", async (locale) => {
    const execute = vi.fn().mockResolvedValue({status: "authenticated", principal, sessionCredential: credential, expiresAt});
    const response = await createStaffLoginRequestHandler(() => ({execute}), {environment: production})(
      formLoginRequest(`email=staff%40example.com&password=password&locale=${locale}`),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/staff");
    expect(response.headers.get("Location")).not.toMatch(/[?#]|^\/\//u);
  });

  it("does not authenticate GET requests", async () => {
    const execute = vi.fn();
    const response = await createStaffLoginRequestHandler(() => ({execute}))(new Request("https://yolpol.com/api/staff/auth/login", {headers: {Origin: "https://yolpol.com"}}));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(await response.json()).toEqual({status: "error", code: "method_not_allowed"});
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns the same neutral failure for unknown, wrong, inactive, and unauthorized identities", async () => {
    for (const internalReason of ["unknown", "wrong_password", "inactive_account", "inactive_team_member"]) {
      const execute = vi.fn().mockResolvedValue({status: "authentication_failed", internalReason});
      const response = await createStaffLoginRequestHandler(() => ({execute}))(loginRequest());
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({status: "error", code: "authentication_failed"});
      expect(response.headers.has("Set-Cookie")).toBe(false);
    }
  });

  it.each([
    ["missing Origin", loginRequest(undefined, {Origin: ""}), 403, "invalid_origin"],
    ["invalid Origin", loginRequest(undefined, {Origin: "https://evil.test"}), 403, "invalid_origin"],
    ["wrong content type", loginRequest("email=x", {"Content-Type": "text/plain"}), 415, "unsupported_media_type"],
    ["unneeded multipart content type", loginRequest("", {"Content-Type": "multipart/form-data; boundary=test"}), 415, "unsupported_media_type"],
    ["malformed JSON", loginRequest("{"), 400, "invalid_request"],
    ["unexpected fields", loginRequest(JSON.stringify({email: "staff@example.com", password: "password", actorReference: "browser:override"})), 400, "invalid_request"],
    ["non-object JSON", loginRequest("[]"), 400, "invalid_request"],
  ])("rejects %s before authentication", async (_label, request, status, code) => {
    const execute = vi.fn();
    const response = await createStaffLoginRequestHandler(() => ({execute}))(request as Request);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({status: "error", code});
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["missing password", "email=staff%40example.com"],
    ["duplicate email", "email=staff%40example.com&email=other%40example.com&password=password"],
    ["duplicate locale", "email=staff%40example.com&password=password&locale=en&locale=fa"],
    ["unexpected field", "email=staff%40example.com&password=password&role=ADMIN"],
    ["malformed percent encoding", "email=staff%ZZexample.com&password=password"],
  ])("rejects malformed URL-encoded input: %s", async (_label, body) => {
    const execute = vi.fn();
    const response = await createStaffLoginRequestHandler(() => ({execute}))(formLoginRequest(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({status: "error", code: "invalid_request"});
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an oversized body even when Content-Length understates it", async () => {
    const response = await createStaffLoginRequestHandler(() => ({execute: vi.fn()}))(loginRequest(JSON.stringify({email: "a", password: "x".repeat(staffLoginRequestSizeLimit)}), {"Content-Length": "1"}));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({status: "error", code: "payload_too_large"});
  });

  it("applies the same byte limit to URL-encoded login bodies", async () => {
    const response = await createStaffLoginRequestHandler(() => ({execute: vi.fn()}))(formLoginRequest(`email=a%40b.test&password=${"x".repeat(staffLoginRequestSizeLimit)}`, {"Content-Length": "1"}));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({status: "error", code: "payload_too_large"});
  });

  it("keeps invalid URL-encoded credentials neutral and cookie-free", async () => {
    const execute = vi.fn().mockResolvedValue({status: "authentication_failed", internalReason: "wrong_password"});
    const response = await createStaffLoginRequestHandler(() => ({execute}))(formLoginRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({status: "error", code: "authentication_failed"});
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("uses a dedicated bounded process-local limiter with Retry-After", async () => {
    const limiter = new StaffLoginRateLimiter({maxRequests: 1, windowMs: 5_000}, () => 0);
    const execute = vi.fn().mockResolvedValue({status: "authentication_failed"});
    const handler = createStaffLoginRequestHandler(() => ({execute}), {rateLimiter: limiter});
    expect((await handler(loginRequest())).status).toBe(401);
    const limited = await handler(loginRequest());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("5");
    expect(limiter.storedEntryCount).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    {STAFF_LOGIN_RATE_LIMIT_MAX_REQUESTS: "0"},
    {STAFF_LOGIN_RATE_LIMIT_MAX_REQUESTS: "NaN"},
    {STAFF_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "0"},
    {STAFF_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "3601"},
  ])("fails closed for invalid limiter configuration", (environment) => {
    expect(() => parseStaffLoginRateLimitConfig(environment)).toThrow();
  });
});

describe("Staff session and logout HTTP boundaries", () => {
  it("reads only one environment-appropriate cookie and returns a safe current principal", async () => {
    const execute = vi.fn().mockResolvedValue({status: "authenticated", principal});
    const request = new Request("https://yolpol.com/api/staff/auth/session", {headers: {Cookie: `other=ignored; __Host-yolpol_staff_session=${credential}`}});
    const response = await createStaffSessionRequestHandler(() => ({execute}), {environment: production})(request);
    expect(execute).toHaveBeenCalledWith({sessionCredential: credential});
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain(credential);
    expect(serialized).not.toMatch(/password|digest|internalUnitPrice|conversationAccess/iu);
  });

  it("returns neutral unauthorized responses for missing, duplicate, expired, or revoked session credentials", async () => {
    const execute = vi.fn().mockResolvedValue({status: "unauthorized"});
    const handler = createStaffSessionRequestHandler(() => ({execute}), {environment: production});
    expect((await handler(new Request("https://yolpol.com/api/staff/auth/session"))).status).toBe(401);
    const duplicate = new Request("https://yolpol.com/api/staff/auth/session", {headers: {Cookie: `__Host-yolpol_staff_session=${credential}; __Host-yolpol_staff_session=${credential}`}});
    expect((await handler(duplicate)).status).toBe(401);
    const present = new Request("https://yolpol.com/api/staff/auth/session", {headers: {Cookie: `__Host-yolpol_staff_session=${credential}`}});
    const unauthorized = await handler(present);
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({status: "unauthorized"});
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
  });

  it("clears the HttpOnly cookie after a completed logout", async () => {
    const execute = vi.fn().mockResolvedValue({status: "completed"});
    const handler = createStaffLogoutRequestHandler(() => ({execute}), {environment: production});
    const request = new Request("https://yolpol.com/api/staff/auth/logout", {method: "POST", headers: {Origin: "https://yolpol.com", Cookie: `__Host-yolpol_staff_session=${credential}`}});
    const response = await handler(request);
    expect(execute).toHaveBeenCalledWith({sessionCredential: credential});
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBe("__Host-yolpol_staff_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it.each(["", "malformed-session-credential"])('clears the cookie when the application safely completes an unknown or malformed credential: "%s"', async (sessionCredential) => {
    const execute = vi.fn().mockResolvedValue({status: "completed"});
    const handler = createStaffLogoutRequestHandler(() => ({execute}), {environment: production});
    const headers = new Headers({Origin: "https://yolpol.com"});
    if (sessionCredential) headers.set("Cookie", `__Host-yolpol_staff_session=${sessionCredential}`);
    const response = await handler(new Request("https://yolpol.com/api/staff/auth/logout", {method: "POST", headers}));
    expect(execute).toHaveBeenCalledWith({sessionCredential});
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it.each(["persistence_failed", "dependency_failed"] as const)("preserves the cookie when logout returns %s", async (status) => {
    const execute = vi.fn().mockResolvedValue({status});
    const handler = createStaffLogoutRequestHandler(() => ({execute}), {environment: production});
    const response = await handler(new Request("https://yolpol.com/api/staff/auth/logout", {method: "POST", headers: {Origin: "https://yolpol.com", Cookie: `__Host-yolpol_staff_session=${credential}`}}));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({status: "error", code: "service_unavailable"});
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("preserves exact Origin protection without invoking logout or clearing the cookie", async () => {
    const execute = vi.fn();
    const handler = createStaffLogoutRequestHandler(() => ({execute}), {environment: production});
    const invalidOrigin = await handler(new Request("https://yolpol.com/api/staff/auth/logout", {method: "POST", headers: {Cookie: `__Host-yolpol_staff_session=${credential}`}}));
    expect(invalidOrigin.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
    expect(invalidOrigin.headers.get("Set-Cookie")).toBeNull();
  });

  it("centralizes the safe production/development cookie-name distinction", () => {
    expect(staffSessionCookieName(production)).toBe("__Host-yolpol_staff_session");
    expect(staffSessionCookieName({NODE_ENV: "development"})).toBe("yolpol_staff_session");
    expect(serializeStaffSessionCookie(credential, expiresAt, {NODE_ENV: "development"})).not.toContain("Secure");
    expect(serializeClearedStaffSessionCookie({NODE_ENV: "development"})).toContain("Max-Age=0");
    expect(readStaffSessionCookie(new Request("http://localhost/api", {headers: {Cookie: `yolpol_staff_session=${credential}`}}), {NODE_ENV: "development"})).toBe(credential);
  });
});
