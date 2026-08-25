import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export type CustomerChatFailure = "required" | "too_long" | "validation" | "rate_limited" | "network" | "service";
export type CustomerChatStatus = "idle" | "submitting";

export type CustomerChatState = Readonly<{
  draft: string;
  messages: readonly CustomerChatMessage[];
  status: CustomerChatStatus;
  failure: CustomerChatFailure | null;
  sentAnnouncement: boolean;
}>;

export type CustomerChatAction =
  | Readonly<{type: "draft_changed"; value: string}>
  | Readonly<{type: "submission_started"}>
  | Readonly<{type: "submission_failed"; failure: CustomerChatFailure}>
  | Readonly<{type: "submission_succeeded"; message: CustomerChatMessage}>;

export function createInitialCustomerChatState(): CustomerChatState {
  return Object.freeze({draft: "", messages: Object.freeze([]), status: "idle", failure: null, sentAnnouncement: false});
}

export function customerMessageDraftFailure(draft: string): "required" | "too_long" | null {
  const normalized = draft.trim();
  if (!normalized) return "required";
  if (normalized.length > messageBodyMaxLength) return "too_long";
  return null;
}

export function customerChatReducer(state: CustomerChatState, action: CustomerChatAction): CustomerChatState {
  switch (action.type) {
    case "draft_changed":
      return Object.freeze({...state, draft: action.value, failure: null, sentAnnouncement: false});
    case "submission_started":
      return Object.freeze({...state, status: "submitting", failure: null, sentAnnouncement: false});
    case "submission_failed":
      return Object.freeze({...state, status: "idle", failure: action.failure, sentAnnouncement: false});
    case "submission_succeeded":
      return Object.freeze({
        draft: "",
        messages: Object.freeze([...state.messages, Object.freeze(action.message)]),
        status: "idle",
        failure: null,
        sentAnnouncement: true,
      });
  }
}
