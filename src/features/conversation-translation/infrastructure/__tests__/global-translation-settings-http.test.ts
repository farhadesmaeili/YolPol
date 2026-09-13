import {describe, expect, it, vi} from "vitest";
import {ChangeGlobalTranslationDefaults} from "@/features/conversation-translation/application/use-cases/change-global-translation-defaults";
import {GetGlobalTranslationDefaults} from "@/features/conversation-translation/application/use-cases/get-global-translation-defaults";
import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import {createGetGlobalTranslationSettingsRequestHandler, createUpdateGlobalTranslationSettingsRequestHandler} from "@/features/conversation-translation/infrastructure/http/global-translation-settings-request-handler";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

const credential = `yps_${"A".repeat(43)}`;
const policy = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "ON_DEMAND" as const};
const principal = {staffAccountId: "account", teamMemberId: "member", role: "ADMIN" as const, displayName: "Admin", actorReference: "staff:member"};

function setup(role: typeof principal.role | "SALES" = "ADMIN") {
  const repository = {
    readEffective: vi.fn(), readGlobalDefaults: vi.fn().mockResolvedValue({...policy, version: 1}),
    changeGlobalDefaults: vi.fn().mockResolvedValue("updated" as const), changeOverride: vi.fn(),
  } satisfies ConversationTranslationControlRepository;
  const authorization = new StaffAuthorizationPolicy();
  const settings = {
    getGlobalDefaults: new GetGlobalTranslationDefaults(repository, authorization),
    changeGlobalDefaults: new ChangeGlobalTranslationDefaults(repository, authorization, {generate: () => "event-1"}, {now: () => new Date("2026-09-08T00:00:00Z")}),
  };
  const access = () => ({resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal: {...principal, role}})}});
  const options = {environment: {NODE_ENV: "test"}, rateLimiter: {consume: () => ({allowed: true})}};
  return {repository, get: createGetGlobalTranslationSettingsRequestHandler(access, () => settings, options), put: createUpdateGlobalTranslationSettingsRequestHandler(access, () => settings, options)};
}

function request(method: "GET" | "PUT", body?: unknown) {
  const headers = new Headers({Cookie: `yolpol_staff_session=${credential}`, Origin: "https://yolpol.com"});
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request("https://yolpol.com/api/staff/translation-settings", {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
}

describe("/api/staff/translation-settings", () => {
  it("reads only the translation defaults DTO for authenticated Staff", async () => {
    const response = await setup("SALES").get(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({status: "found", value: {...policy, version: 1}});
  });

  it("updates defaults for Administrators with a server-derived actor and optimistic version", async () => {
    const {put, repository} = setup();
    const response = await put(request("PUT", {...policy, expectedVersion: 1}));
    expect(response.status).toBe(200);
    expect(repository.changeGlobalDefaults).toHaveBeenCalledWith(expect.objectContaining({...policy, expectedVersion: 1, actorReference: "staff:member"}));
    expect(JSON.stringify(await response.json())).not.toMatch(/provider|credential|price/iu);
  });

  it("denies non-privileged mutation and rejects extra internal fields", async () => {
    expect((await setup("SALES").put(request("PUT", {...policy, expectedVersion: 1}))).status).toBe(403);
    expect((await setup().put(request("PUT", {...policy, expectedVersion: 1, provider: "private"}))).status).toBe(400);
  });
});
