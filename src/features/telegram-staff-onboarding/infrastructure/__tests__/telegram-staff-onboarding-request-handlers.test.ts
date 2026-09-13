import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {
  createDisconnectOwnTelegramRequestHandler,
  createForceDisconnectStaffTelegramRequestHandler,
  createOwnTelegramConnectionRequestHandler,
  createOwnTelegramConnectionStateRequestHandler,
  createRevokeOwnTelegramRequestHandler,
  createRevokeStaffTelegramRequestHandler,
} from "@/features/telegram-staff-onboarding/infrastructure/http/telegram-staff-onboarding-request-handlers";

const credential = `yps_${"A".repeat(43)}`;
const connectionToken = `ypt_${"B".repeat(43)}`;
const principal = (role: StaffPrincipal["role"] = "VIEWER"): StaffPrincipal => ({
  staffAccountId: `account-${role.toLowerCase()}`, teamMemberId: `member-${role.toLowerCase()}`,
  role, displayName: role, actorReference: `staff:member-${role.toLowerCase()}`,
});

function access(result: unknown = {status: "authenticated", principal: principal()}) {
  return {resolveSession: {execute: vi.fn().mockResolvedValue(result)}};
}

function onboarding() {
  return {
    getOwnConnection: {execute: vi.fn().mockResolvedValue({status: "not_connected"})},
    createOwnConnectionRequest: {execute: vi.fn().mockResolvedValue({status: "created", connectionToken, expiresAt: "2026-08-30T12:10:00.000Z"})},
    disconnectOwn: {execute: vi.fn().mockResolvedValue({status: "disconnected"})},
    forceDisconnectStaff: {execute: vi.fn().mockResolvedValue({status: "unavailable"})},
    revokeOwnConnectionRequest: {execute: vi.fn().mockResolvedValue({status: "revoked"})},
    revokeStaffConnectionRequest: {execute: vi.fn().mockResolvedValue({status: "unavailable"})},
  };
}

function request(path: string, input: Readonly<{method?: string; body?: string; origin?: string; authenticated?: boolean}> = {}) {
  return new Request(`https://yolpol.com${path}`, {
    method: input.method ?? "POST",
    headers: {
      Origin: input.origin ?? "https://yolpol.com",
      "Content-Type": "application/json",
      ...(input.authenticated === false ? {} : {Cookie: `yolpol_staff_session=${credential}`}),
    },
    ...(input.body === undefined ? {} : {body: input.body}),
  });
}

describe("Telegram Staff onboarding HTTP boundary", () => {
  it("returns an authenticated safe own status DTO with no-store", async () => {
    const useCases = onboarding();
    useCases.getOwnConnection.execute.mockResolvedValue({status: "pending", expiresAt: "2026-08-30T12:10:00.000Z"});
    const response = await createOwnTelegramConnectionStateRequestHandler(access, () => useCases)(request("/api/staff/telegram", {method: "GET"}));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe('{"status":"found","connection":{"status":"PENDING","pendingExpiresAt":"2026-08-30T12:10:00.000Z"}}');
    expect(serialized).not.toMatch(/telegramUser|chatId|token|digest|linkId/iu);
  });

  it("denies missing, inactive, revoked, or expired Staff sessions", async () => {
    const useCases = onboarding();
    const noCookie = await createOwnTelegramConnectionStateRequestHandler(access, () => useCases)(request("/api/staff/telegram", {method: "GET", authenticated: false}));
    expect(noCookie.status).toBe(401);
    const inactiveAccess = access({status: "unauthorized"});
    const inactive = await createOwnTelegramConnectionRequestHandler(() => inactiveAccess, () => useCases, () => "YolpolBot")(request("/api/staff/telegram/connection-request", {body: "{}"}));
    expect(inactive.status).toBe(401);
    expect(useCases.createOwnConnectionRequest.execute).not.toHaveBeenCalled();
  });

  it.each(["VIEWER", "SALES"] as const)("allows %s to issue an own token once in the no-store response", async (role) => {
    const staffAccess = access({status: "authenticated", principal: principal(role)});
    const useCases = onboarding();
    const response = await createOwnTelegramConnectionRequestHandler(() => staffAccess, () => useCases, () => "YolpolBot")(request("/api/staff/telegram/connection-request", {body: "{}"}));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "created", connectionToken, deepLink: `https://t.me/YolpolBot?start=${connectionToken}`, expiresAt: "2026-08-30T12:10:00.000Z",
    });
    expect(useCases.createOwnConnectionRequest.execute).toHaveBeenCalledWith({principal: principal(role)});
  });

  it("rejects cross-origin and actor-bearing bodies before mutation", async () => {
    const staffAccess = access();
    const useCases = onboarding();
    const handler = createOwnTelegramConnectionRequestHandler(() => staffAccess, () => useCases, () => "YolpolBot");
    expect((await handler(request("/api/staff/telegram/connection-request", {origin: "https://attacker.example", body: "{}"}))).status).toBe(403);
    expect((await handler(request("/api/staff/telegram/connection-request", {body: '{"staffAccountId":"attacker"}'}))).status).toBe(400);
    expect(useCases.createOwnConnectionRequest.execute).not.toHaveBeenCalled();
  });

  it("supports own disconnect and request cancellation without browser target IDs", async () => {
    const useCases = onboarding();
    const disconnect = await createDisconnectOwnTelegramRequestHandler(access, () => useCases)(request("/api/staff/telegram/disconnect", {body: "{}"}));
    const revoke = await createRevokeOwnTelegramRequestHandler(access, () => useCases)(request("/api/staff/telegram/connection-request/revoke", {body: "{}"}));
    expect(await disconnect.json()).toEqual({status: "disconnected"});
    expect(await revoke.json()).toEqual({status: "revoked"});
    expect(useCases.disconnectOwn.execute).toHaveBeenCalledWith({principal: principal()});
    expect(useCases.revokeOwnConnectionRequest.execute).toHaveBeenCalledWith({principal: principal()});
  });

  it("keeps unauthorized manager target states indistinguishable", async () => {
    const useCases = onboarding();
    const context = {params: Promise.resolve({staffAccountId: "target-account"})};
    const disconnect = await createForceDisconnectStaffTelegramRequestHandler(access, () => useCases)(request("/api/staff/team/accounts/target-account/telegram/disconnect", {body: "{}"}), context);
    const revoke = await createRevokeStaffTelegramRequestHandler(access, () => useCases)(request("/api/staff/team/accounts/target-account/telegram/connection-request/revoke", {body: "{}"}), context);
    expect(await disconnect.json()).toEqual({status: "error", code: "unavailable"});
    expect(await revoke.json()).toEqual({status: "error", code: "unavailable"});
  });
});
