import {describe, expect, it} from "vitest";

import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";
import {createStaffClientMessageId} from "@/features/inquiries/presentation/clients/staff-conversation-reply-client";
import {createInitialStaffReplyState, staffReplyDraftFailure, staffReplyReducer} from "@/features/inquiries/presentation/state/staff-reply-reducer";

const persistedMessage: StaffConversationMessageDto = Object.freeze({
  id: "staff_web_message-1",
  senderType: "INTERNAL_USER",
  channel: "WEBSITE",
  actorReference: "staff:member-1",
  body: "Line one\nLine two",
  createdAt: "2026-08-26T10:00:00.000Z",
});

describe("Staff Reply state", () => {
  it("refreshes translation state and new messages while preserving the current draft", () => {
    const initialState = createInitialStaffReplyState({conversationCursor: 0, messages: [persistedMessage]});
    const drafted = staffReplyReducer(initialState, {type: "draft_changed", value: "Unsent draft"});
    const translated: StaffConversationMessageDto = {...persistedMessage, translation: {sourceLocale: "fa", customerTargetLocale: "tr", translations: [{targetLocale: "tr", status: "SUCCEEDED", body: "Translated text"}]}};
    const refreshed = staffReplyReducer(drafted, {type: "translation_snapshot", messages: [translated, {...persistedMessage, id: "later"}]});
    expect(refreshed.draft).toBe("Unsent draft");
    expect(refreshed.messages.map(({id}) => id)).toEqual([persistedMessage.id, "later"]);
    expect(refreshed.messages[0]?.body).toBe(persistedMessage.body);
    expect(refreshed.messages[0]?.translation?.translations[0]?.status).toBe("SUCCEEDED");
  });
  const initial = (messages: readonly StaffConversationMessageDto[] = [], conversationCursor = messages.length - 1) => (
    createInitialStaffReplyState({conversationCursor, messages})
  );

  it("rejects blank and oversized drafts without truncating valid multiline text", () => {
    const oversized = "x".repeat(messageBodyMaxLength + 1);
    expect(staffReplyDraftFailure(" \n ")).toBe("required");
    expect(staffReplyDraftFailure(oversized)).toBe("too_long");
    expect(oversized).toHaveLength(messageBodyMaxLength + 1);
    expect(staffReplyDraftFailure("Line one\nLine two")).toBeNull();
  });

  it("preserves the draft and client ID for an uncertain retry", () => {
    let state = initial();
    state = staffReplyReducer(state, {type: "draft_changed", value: persistedMessage.body});
    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: "logical-message-1"});
    state = staffReplyReducer(state, {type: "submission_failed", failure: "service_unavailable"});
    expect(state).toMatchObject({draft: persistedMessage.body, clientMessageId: "logical-message-1", status: "error"});

    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: state.clientMessageId ?? "wrong"});
    expect(state.clientMessageId).toBe("logical-message-1");
  });

  it("treats an edited failed draft and a retry conflict as a new logical message", () => {
    let state = staffReplyReducer(initial(), {type: "draft_changed", value: "First reply"});
    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: "logical-message-1"});
    state = staffReplyReducer(state, {type: "submission_failed", failure: "service_unavailable"});
    state = staffReplyReducer(state, {type: "draft_changed", value: "Changed reply"});
    expect(state.clientMessageId).toBeNull();

    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: "logical-message-2"});
    state = staffReplyReducer(state, {type: "submission_failed", failure: "retry_conflict", discardClientMessageId: true});
    expect(state.clientMessageId).toBeNull();
    expect(state.draft).toBe("Changed reply");
  });

  it("clears a successful draft, deduplicates by message ID, and resets the next-message key", () => {
    let state = staffReplyReducer(initial([persistedMessage]), {type: "draft_changed", value: persistedMessage.body});
    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: "logical-message-1"});
    state = staffReplyReducer(state, {type: "submission_succeeded", message: persistedMessage});
    expect(state).toMatchObject({draft: "", clientMessageId: null, status: "success"});
    expect(state.messages).toHaveLength(1);

    const ids = ["next-logical-message-1", "next-logical-message-2"];
    const cryptoProvider = {randomUUID: () => ids.shift() ?? "missing", getRandomValues: undefined};
    expect(createStaffClientMessageId(cryptoProvider)).toBe("next-logical-message-1");
    expect(createStaffClientMessageId(cryptoProvider)).toBe("next-logical-message-2");
  });

  it("appends resumable realtime messages once by cursor and stable message ID", () => {
    const customerMessage = Object.freeze({...persistedMessage, id: "customer-message-2", senderType: "CUSTOMER" as const, actorReference: null});
    let state = initial([persistedMessage], 0);

    state = staffReplyReducer(state, {type: "conversation_message_received", cursor: 1, message: customerMessage});
    state = staffReplyReducer(state, {type: "conversation_message_received", cursor: 1, message: customerMessage});
    expect(state.conversationCursor).toBe(1);
    expect(state.messages.map(({id}) => id)).toEqual([persistedMessage.id, customerMessage.id]);
  });

  it("reconciles a locally appended Staff reply without rendering its SSE echo twice", () => {
    let state = initial([], -1);
    state = staffReplyReducer(state, {type: "submission_succeeded", message: persistedMessage});
    state = staffReplyReducer(state, {type: "conversation_message_received", cursor: 0, message: persistedMessage});

    expect(state.conversationCursor).toBe(0);
    expect(state.messages).toEqual([persistedMessage]);
  });
});
