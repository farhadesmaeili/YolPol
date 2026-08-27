import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import type {StaffConversationReplyFailure} from "@/features/inquiries/presentation/clients/staff-conversation-reply-client";
import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";

export type StaffReplyStatus = "idle" | "sending" | "success" | "error";
export type StaffReplyDraftFailure = "required" | "too_long";

export type StaffReplyState = Readonly<{
  clientMessageId: string | null;
  conversationCursor: number;
  draft: string;
  failure: StaffReplyDraftFailure | StaffConversationReplyFailure | null;
  messages: readonly StaffConversationMessageDto[];
  status: StaffReplyStatus;
}>;

export type StaffReplyAction =
  | Readonly<{type: "draft_changed"; value: string}>
  | Readonly<{type: "submission_started"; clientMessageId: string}>
  | Readonly<{type: "submission_failed"; failure: StaffReplyDraftFailure | StaffConversationReplyFailure; discardClientMessageId?: boolean}>
  | Readonly<{type: "submission_succeeded"; message: StaffConversationMessageDto}>
  | Readonly<{type: "conversation_message_received"; cursor: number; message: StaffConversationMessageDto}>;

export function staffReplyDraftFailure(draft: string): StaffReplyDraftFailure | null {
  const normalized = draft.trim();
  if (!normalized) return "required";
  if (normalized.length > messageBodyMaxLength) return "too_long";
  return null;
}

export function createInitialStaffReplyState(input: Readonly<{
  conversationCursor: number;
  messages: readonly StaffConversationMessageDto[];
}>): StaffReplyState {
  return Object.freeze({
    clientMessageId: null,
    conversationCursor: input.conversationCursor,
    draft: "",
    failure: null,
    messages: Object.freeze([...input.messages]),
    status: "idle",
  });
}

export function staffReplyReducer(state: StaffReplyState, action: StaffReplyAction): StaffReplyState {
  switch (action.type) {
    case "draft_changed":
      return Object.freeze({
        ...state,
        clientMessageId: action.value === state.draft ? state.clientMessageId : null,
        draft: action.value,
        failure: null,
        status: "idle",
      });
    case "submission_started":
      return Object.freeze({...state, clientMessageId: action.clientMessageId, failure: null, status: "sending"});
    case "submission_failed":
      return Object.freeze({
        ...state,
        clientMessageId: action.discardClientMessageId ? null : state.clientMessageId,
        failure: action.failure,
        status: "error",
      });
    case "submission_succeeded":
      return Object.freeze({
        ...state,
        clientMessageId: null,
        draft: "",
        failure: null,
        messages: state.messages.some(({id}) => id === action.message.id)
          ? state.messages
          : Object.freeze([...state.messages, Object.freeze(action.message)]),
        status: "success",
      });
    case "conversation_message_received":
      if (action.cursor <= state.conversationCursor) return state;
      return Object.freeze({
        ...state,
        conversationCursor: action.cursor,
        messages: state.messages.some(({id}) => id === action.message.id)
          ? state.messages
          : Object.freeze([...state.messages, Object.freeze(action.message)]),
      });
  }
}
