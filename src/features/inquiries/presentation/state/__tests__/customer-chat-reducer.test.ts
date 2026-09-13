import {describe, expect, it} from "vitest";

import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";
import {createInitialCustomerChatState, customerChatReducer, customerMessageDraftFailure} from "@/features/inquiries/presentation/state/customer-chat-reducer";

describe("Customer chat presentation state", () => {
  it("keeps a repaired SSE row ordered when an older history request completes afterwards", () => {
    const safe = {id: "ai", body: "Safe AI", sender: "support" as const, position: 25};
    const repaired = {id: "staff", body: "Safe translation", sender: "support" as const, position: 20};
    let state = createInitialCustomerChatState();
    state = customerChatReducer(state, {type: "realtime_message_received", message: safe});
    state = customerChatReducer(state, {type: "realtime_message_received", message: repaired});
    state = customerChatReducer(state, {type: "history_succeeded", messages: [safe]});
    state = customerChatReducer(state, {type: "realtime_message_received", message: repaired});
    expect(state.messages).toEqual([repaired, safe]);
  });

  it("places a delayed translation before later local Customer activity and deduplicates its acknowledgement", () => {
    let state = createInitialCustomerChatState([{id: "customer-1", body: "First", sender: "customer", position: 0}]);
    state = customerChatReducer(state, {type: "submission_succeeded", message: {id: "customer-2", body: "Later", sender: "customer"}});
    state = customerChatReducer(state, {type: "realtime_message_received", message: {id: "staff", body: "Translation", sender: "support", position: 1}});
    state = customerChatReducer(state, {type: "realtime_message_received", message: {id: "customer-2", body: "Later", sender: "customer", position: 2}});
    expect(state.messages.map(({id}) => id)).toEqual(["customer-1", "staff", "customer-2"]);
  });
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
