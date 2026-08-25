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
    expect(failed).toMatchObject({draft: "Please update me", status: "idle", historyStatus: "loading", failure: "network", sentAnnouncement: false});
  });

  it("loads ordered history and preserves a concurrently acknowledged message", () => {
    const local = customerChatReducer(createInitialCustomerChatState(), {type: "submission_succeeded", message: {id: "message_3", body: "Latest", sender: "customer"}});
    const loaded = customerChatReducer(local, {type: "history_succeeded", messages: [
      {id: "message_1", body: "First", sender: "customer"},
      {id: "message_2", body: "Second", sender: "support"},
    ]});
    expect(loaded).toMatchObject({historyStatus: "loaded", historyFailure: null, messages: [
      {id: "message_1", body: "First", sender: "customer"},
      {id: "message_2", body: "Second", sender: "support"},
      {id: "message_3", body: "Latest", sender: "customer"},
    ]});
  });

  it("keeps sending available when history loading fails", () => {
    const failed = customerChatReducer(createInitialCustomerChatState(), {type: "history_failed", failure: "service"});
    expect(failed).toMatchObject({status: "idle", historyStatus: "failed", historyFailure: "service", failure: null});
  });

  it("adds an acknowledged message and clears only the sent draft", () => {
    const drafted = customerChatReducer(createInitialCustomerChatState(), {type: "draft_changed", value: "Please update me"});
    const sent = customerChatReducer(drafted, {type: "submission_succeeded", message: {id: "message_1", body: "Please update me", sender: "customer"}});
    expect(sent).toEqual({draft: "", messages: [{id: "message_1", body: "Please update me", sender: "customer"}], status: "idle", historyStatus: "loading", historyFailure: null, failure: null, sentAnnouncement: true});
  });

  it("appends realtime messages once without changing send or history state", () => {
    const initial = customerChatReducer(createInitialCustomerChatState(), {type: "realtime_message_received", message: {id: "message_1", body: "Your quote is ready.", sender: "support"}});
    const duplicate = customerChatReducer(initial, {type: "realtime_message_received", message: {id: "message_1", body: "Your quote is ready.", sender: "support"}});
    expect(duplicate).toBe(initial);
    expect(duplicate).toMatchObject({messages: [{id: "message_1", body: "Your quote is ready.", sender: "support"}], status: "idle", historyStatus: "loading"});
  });
});
