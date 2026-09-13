import {describe, expect, it, vi} from "vitest";
import {ChangeConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/change-conversation-translation-control";
import {ChangeGlobalTranslationDefaults} from "@/features/conversation-translation/application/use-cases/change-global-translation-defaults";
import {GetConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/get-conversation-translation-control";
import {GetGlobalTranslationDefaults} from "@/features/conversation-translation/application/use-cases/get-global-translation-defaults";
import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

const now = new Date("2026-09-07T00:00:00.000Z");
const principal = {staffAccountId: "account", teamMemberId: "member", role: "SALES" as const, displayName: "Sales", actorReference: "staff:member"};
const admin = {...principal, role: "ADMIN" as const};
const policy = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "ON_DEMAND" as const};
const effective = {globalDefaults: {...policy, version: 0}, override: null, effective: policy, source: "GLOBAL" as const};

function repository(result: "updated" | "unchanged" | "not_found" | "conflict" = "updated") {
  return {
    readEffective: vi.fn().mockResolvedValue(effective),
    readGlobalDefaults: vi.fn().mockResolvedValue(effective.globalDefaults),
    changeGlobalDefaults: vi.fn().mockResolvedValue(result === "not_found" ? "conflict" : result),
    changeOverride: vi.fn().mockResolvedValue(result),
  } satisfies ConversationTranslationControlRepository;
}

describe("Translation settings use cases", () => {
  it("reads effective conversation settings and global defaults for authorized Staff", async () => {
    const store = repository();
    await expect(new GetConversationTranslationControl(store, new StaffAuthorizationPolicy()).execute({inquiryId: "inquiry", principal})).resolves.toEqual({status: "found", value: effective});
    await expect(new GetGlobalTranslationDefaults(store, new StaffAuthorizationPolicy()).execute(principal)).resolves.toEqual({status: "found", value: effective.globalDefaults});
  });

  it("sets and removes a conversation override with server-derived actor and optimistic version", async () => {
    const store = repository();
    const useCase = new ChangeConversationTranslationControl(store, new StaffAuthorizationPolicy(), {generate: () => "event-1"}, {now: () => now});
    await expect(useCase.execute({...policy, action: "SET", expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "updated"});
    expect(store.changeOverride).toHaveBeenCalledWith({inquiryId: "inquiry", action: "SET", policy, expectedVersion: 0, actorReference: "staff:member", eventId: "event-1", now});
    await expect(useCase.execute({action: "REMOVE", expectedVersion: 1, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "updated"});
    expect(store.changeOverride).toHaveBeenLastCalledWith({inquiryId: "inquiry", action: "REMOVE", expectedVersion: 1, actorReference: "staff:member", eventId: "event-1", now});
  });

  it("allows only Administrator roles to update global defaults", async () => {
    const store = repository();
    const useCase = new ChangeGlobalTranslationDefaults(store, new StaffAuthorizationPolicy(), {generate: () => "global-event"}, {now: () => now});
    await expect(useCase.execute({...policy, expectedVersion: 0, principal})).resolves.toEqual({status: "forbidden"});
    await expect(useCase.execute({...policy, expectedVersion: 0, principal: admin})).resolves.toMatchObject({status: "updated"});
    expect(store.changeGlobalDefaults).toHaveBeenCalledWith({...policy, expectedVersion: 0, actorReference: "staff:member", eventId: "global-event", now});
  });

  it("rejects invalid override actions, modes, stale versions, and Viewer mutation", async () => {
    const store = repository("conflict");
    const useCase = new ChangeConversationTranslationControl(store, new StaffAuthorizationPolicy(), {generate: () => "event-1"}, {now: () => now});
    await expect(useCase.execute({...policy, action: "SET", customerToStaffMode: "OFF", expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "validation_failed", field: "customerToStaffMode"});
    await expect(useCase.execute({...policy, action: "UNKNOWN", expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "validation_failed", field: "action"});
    await expect(useCase.execute({...policy, action: "SET", expectedVersion: -1, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "validation_failed", field: "expectedVersion"});
    await expect(useCase.execute({...policy, action: "SET", expectedVersion: 0, inquiryId: "inquiry", principal: {...principal, role: "VIEWER"}})).resolves.toMatchObject({status: "forbidden"});
    await expect(useCase.execute({...policy, action: "SET", expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "conflict"});
  });
});
