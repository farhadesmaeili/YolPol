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
  it("rejects blank and oversized drafts without truncating valid multiline text", () => {
    const oversized = "x".repeat(messageBodyMaxLength + 1);
    expect(staffReplyDraftFailure(" \n ")).toBe("required");
    expect(staffReplyDraftFailure(oversized)).toBe("too_long");
    expect(oversized).toHaveLength(messageBodyMaxLength + 1);
    expect(staffReplyDraftFailure("Line one\nLine two")).toBeNull();
  });

  it("preserves the draft and client ID for an uncertain retry", () => {
    let state = createInitialStaffReplyState([]);
    state = staffReplyReducer(state, {type: "draft_changed", value: persistedMessage.body});
    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: "logical-message-1"});
    state = staffReplyReducer(state, {type: "submission_failed", failure: "service_unavailable"});
    expect(state).toMatchObject({draft: persistedMessage.body, clientMessageId: "logical-message-1", status: "error"});

    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: state.clientMessageId ?? "wrong"});
    expect(state.clientMessageId).toBe("logical-message-1");
  });

  it("treats an edited failed draft and a retry conflict as a new logical message", () => {
    let state = staffReplyReducer(createInitialStaffReplyState([]), {type: "draft_changed", value: "First reply"});
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
    let state = staffReplyReducer(createInitialStaffReplyState([persistedMessage]), {type: "draft_changed", value: persistedMessage.body});
    state = staffReplyReducer(state, {type: "submission_started", clientMessageId: "logical-message-1"});
    state = staffReplyReducer(state, {type: "submission_succeeded", message: persistedMessage});
    expect(state).toMatchObject({draft: "", clientMessageId: null, status: "success"});
    expect(state.messages).toHaveLength(1);

    const ids = ["next-logical-message-1", "next-logical-message-2"];
    const cryptoProvider = {randomUUID: () => ids.shift() ?? "missing", getRandomValues: undefined};
    expect(createStaffClientMessageId(cryptoProvider)).toBe("next-logical-message-1");
    expect(createStaffClientMessageId(cryptoProvider)).toBe("next-logical-message-2");
  });
});
