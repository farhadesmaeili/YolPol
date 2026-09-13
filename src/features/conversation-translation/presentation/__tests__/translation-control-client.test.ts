import {describe, expect, it, vi} from "vitest";
import {removeConversationTranslationOverride, setConversationTranslationOverride, updateGlobalTranslationDefaults} from "@/features/conversation-translation/presentation/clients/translation-control-client";

const policy = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "MANUAL" as const, aiToStaffMode: "ON_DEMAND" as const};
const globalValue = {...policy, version: 2};
const controlValue = {globalDefaults: globalValue, override: {...policy, version: 1}, effective: policy, source: "OVERRIDE"};

describe("translation settings clients", () => {
  it("sends an exact global DTO without leaking display or persistence fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({status: "updated", value: globalValue}));
    await updateGlobalTranslationDefaults({...policy, expectedVersion: 1, version: 999} as typeof policy & {expectedVersion: number}, fetcher);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body).toEqual({...policy, expectedVersion: 1});
  });

  it("uses explicit SET and REMOVE override actions with encoded Inquiry identity", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({status: "updated", value: controlValue})));
    await setConversationTranslationOverride({...policy, inquiryId: "inquiry/one", expectedVersion: 0}, fetcher);
    expect(fetcher.mock.calls[0]![0]).toBe("/api/staff/inquiries/inquiry%2Fone/translation-control");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({action: "SET", ...policy, expectedVersion: 0});
    await removeConversationTranslationOverride({inquiryId: "inquiry", expectedVersion: 1}, fetcher);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({action: "REMOVE", expectedVersion: 1});
  });
});
