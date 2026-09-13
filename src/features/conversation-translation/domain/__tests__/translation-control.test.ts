import {describe, expect, it} from "vitest";
import {ConversationTranslationControl} from "@/features/conversation-translation/domain/entities/conversation-translation-control";
import {allowsOnDemandTranslation, automaticTranslationTargets, requestedTranslationTarget} from "@/features/conversation-translation/domain/services/translation-scheduling-policy";
import {defaultConversationTranslationPolicy, resolveConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";

describe("Conversation Translation Control domain", () => {
  it("defaults all three directions to current automatic behavior", () => {
    expect(defaultConversationTranslationPolicy).toEqual({customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND"});
    expect(automaticTranslationTargets({senderType: "CUSTOMER", sourceLocale: "tr", customerTargetLocale: null, staffTargetLocale: "fa", policy: defaultConversationTranslationPolicy})).toEqual(["fa"]);
    expect(automaticTranslationTargets({senderType: "INTERNAL_USER", sourceLocale: "fa", customerTargetLocale: "tr", staffTargetLocale: "fa", policy: defaultConversationTranslationPolicy})).toEqual(["tr"]);
    expect(automaticTranslationTargets({senderType: "AI_AGENT", sourceLocale: "tr", customerTargetLocale: "tr", staffTargetLocale: "fa", policy: defaultConversationTranslationPolicy})).toEqual([]);
  });

  it("resolves an override ahead of persisted globals and deterministic fallback defaults", () => {
    const globalDefaults = {customerToStaffMode: "MANUAL" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "AUTO" as const};
    const override = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "MANUAL" as const, aiToStaffMode: "ON_DEMAND" as const};
    expect(resolveConversationTranslationPolicy({globalDefaults})).toEqual(globalDefaults);
    expect(resolveConversationTranslationPolicy({globalDefaults, override})).toEqual(override);
    expect(resolveConversationTranslationPolicy({})).toEqual(defaultConversationTranslationPolicy);
  });

  it("suppresses only the selected convenience or required automatic scheduling", () => {
    const policy = {customerToStaffMode: "MANUAL", staffToCustomerMode: "MANUAL", aiToStaffMode: "ON_DEMAND"} as const;
    for (const senderType of ["CUSTOMER", "INTERNAL_USER", "AI_AGENT"] as const) {
      expect(automaticTranslationTargets({senderType, sourceLocale: "tr", customerTargetLocale: "tr", staffTargetLocale: "fa", policy})).toEqual([]);
      expect(allowsOnDemandTranslation(senderType, policy)).toBe(true);
    }
  });

  it("derives manual targets without browser-controlled locale input", () => {
    expect(requestedTranslationTarget({senderType: "CUSTOMER", sourceLocale: "tr", customerTargetLocale: null, staffTargetLocale: "fa"})).toBe("fa");
    expect(requestedTranslationTarget({senderType: "INTERNAL_USER", sourceLocale: "fa", customerTargetLocale: "tr", staffTargetLocale: "fa"})).toBe("tr");
    expect(requestedTranslationTarget({senderType: "AI_AGENT", sourceLocale: "tr", customerTargetLocale: "tr", staffTargetLocale: "fa"})).toBe("fa");
    expect(requestedTranslationTarget({senderType: "SYSTEM", sourceLocale: "tr", customerTargetLocale: "tr", staffTargetLocale: "fa"})).toBeNull();
  });

  it("rejects invalid persisted mode combinations and metadata", () => {
    const valid = {conversationId: "conversation-1", customerToStaffMode: "AUTO", staffToCustomerMode: "MANUAL", aiToStaffMode: "ON_DEMAND", version: 1, updatedAt: new Date(), updatedBy: "staff:member-1"};
    expect(ConversationTranslationControl.restore(valid)).toMatchObject(valid);
    for (const patch of [{customerToStaffMode: "OFF"}, {staffToCustomerMode: "OFF"}, {aiToStaffMode: "MANUAL"}, {version: 0}, {updatedBy: "browser:forged"}]) {
      expect(() => ConversationTranslationControl.restore({...valid, ...patch})).toThrow();
    }
  });
});
