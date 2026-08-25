import {describe, expect, it} from "vitest";

import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";
import {createInitialCustomerChatState, customerChatReducer, customerMessageDraftFailure} from "@/features/inquiries/presentation/state/customer-chat-reducer";

describe("Customer chat presentation state", () => {
  it("validates empty and oversized drafts before communication", () => {
    expect(customerMessageDraftFailure("   ")).toBe("required");
    expect(customerMessageDraftFailure("x".repeat(messageBodyMaxLength + 1))).toBe("too_long");
    expect(customerMessageDraftFailure(" Follow up ")).toBeNull();
  });

  it("preserves the draft when sending fails", () => {
    const drafted = customerChatReducer(createInitialCustomerChatState(), {type: "draft_changed", value: "Please update me"});
    const sending = customerChatReducer(drafted, {type: "submission_started"});
    const failed = customerChatReducer(sending, {type: "submission_failed", failure: "network"});
    expect(failed).toMatchObject({draft: "Please update me", status: "idle", failure: "network", sentAnnouncement: false});
  });

  it("adds an acknowledged message and clears only the sent draft", () => {
    const drafted = customerChatReducer(createInitialCustomerChatState(), {type: "draft_changed", value: "Please update me"});
    const sent = customerChatReducer(drafted, {type: "submission_succeeded", message: {id: "message_1", body: "Please update me", sender: "customer"}});
    expect(sent).toEqual({draft: "", messages: [{id: "message_1", body: "Please update me", sender: "customer"}], status: "idle", failure: null, sentAnnouncement: true});
  });
});
