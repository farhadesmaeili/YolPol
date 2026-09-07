import {describe, expect, it, vi} from "vitest";
import {ChangeConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/change-conversation-translation-control";
import {GetConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/get-conversation-translation-control";
import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

const now = new Date("2026-09-07T00:00:00.000Z");
const principal = {staffAccountId: "account", teamMemberId: "member", role: "SALES" as const, displayName: "Sales", actorReference: "staff:member"};
const defaults = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "AUTO" as const, version: 0};
const automaticPolicy = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "AUTO" as const};

function repository(result: "updated" | "unchanged" | "not_found" | "conflict" = "updated") {
  return {
    read: vi.fn().mockResolvedValue(defaults),
    change: vi.fn().mockResolvedValue(result),
  } satisfies ConversationTranslationControlRepository;
}

describe("Conversation Translation Control use cases", () => {
  it("reads the backward-compatible AUTO/AUTO/AUTO default for authorized Staff", async () => {
    const store = repository();
    await expect(new GetConversationTranslationControl(store, new StaffAuthorizationPolicy()).execute({inquiryId: "inquiry", principal}))
      .resolves.toEqual({status: "found", value: defaults});
  });

  it.each([
    {customerToStaffMode: "MANUAL", staffToCustomerMode: "AUTO", aiToStaffMode: "AUTO"},
    {customerToStaffMode: "AUTO", staffToCustomerMode: "MANUAL", aiToStaffMode: "AUTO"},
    {customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND"},
  ] as const)("changes a valid directional mode with server-derived actor and optimistic version", async (modes) => {
    const store = repository();
    const useCase = new ChangeConversationTranslationControl(store, new StaffAuthorizationPolicy(), {generate: () => "event-1"}, {now: () => now});
    await expect(useCase.execute({...modes, expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "updated"});
    expect(store.change).toHaveBeenCalledWith({...modes, expectedVersion: 0, inquiryId: "inquiry", actorReference: "staff:member", eventId: "event-1", now});
  });

  it("rejects invalid combinations, stale versions, and unauthorized mutation", async () => {
    const store = repository("conflict");
    const useCase = new ChangeConversationTranslationControl(store, new StaffAuthorizationPolicy(), {generate: () => "event-1"}, {now: () => now});
    await expect(useCase.execute({...automaticPolicy, customerToStaffMode: "OFF", expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "validation_failed", field: "customerToStaffMode"});
    await expect(useCase.execute({...automaticPolicy, expectedVersion: 0, inquiryId: "../inquiry", principal})).resolves.toMatchObject({status: "validation_failed", field: "inquiryId"});
    await expect(useCase.execute({...automaticPolicy, expectedVersion: -1, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "validation_failed", field: "expectedVersion"});
    await expect(useCase.execute({...automaticPolicy, expectedVersion: 0, inquiryId: "inquiry", principal: {...principal, role: "VIEWER"}})).resolves.toMatchObject({status: "forbidden"});
    await expect(useCase.execute({...automaticPolicy, expectedVersion: 0, inquiryId: "inquiry", principal})).resolves.toMatchObject({status: "conflict"});
  });
});
