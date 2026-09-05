"use client";

import {useEffect, useId, useReducer, useRef, useState, type FormEvent, type KeyboardEvent} from "react";

import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";
import {ConversationTypingHeartbeat, sendStaffConversationTyping} from "@/features/inquiries/presentation/clients/conversation-typing-client";
import {createStaffClientMessageId, sendStaffConversationReply, type StaffConversationReplyFailure} from "@/features/inquiries/presentation/clients/staff-conversation-reply-client";
import {subscribeToStaffConversation} from "@/features/inquiries/presentation/clients/staff-conversation-stream-client";
import {ConversationTypingIndicator} from "@/features/inquiries/presentation/components/conversation-typing-indicator";
import {StaffConversationMessageList, type StaffConversationLabels} from "@/features/inquiries/presentation/components/staff/staff-conversation-message-list";
import {createInitialStaffReplyState, staffReplyDraftFailure, staffReplyReducer, type StaffReplyDraftFailure} from "@/features/inquiries/presentation/state/staff-reply-reducer";
import {useRouter} from "@/i18n/navigation";
import type {Locale} from "@/shared/types/locale";

export type StaffReplyComposerLabels = StaffConversationLabels & Readonly<{
  characters: string;
  customerTyping: string;
  keyboardHint: string;
  replyToCustomer: string;
  sendReply: string;
  sending: string;
  sent: string;
  writeReply: string;
  errors: Readonly<Record<StaffReplyDraftFailure | StaffConversationReplyFailure, string>>;
}>;

function errorMessage(failure: StaffReplyDraftFailure | StaffConversationReplyFailure, labels: StaffReplyComposerLabels): string {
  return labels.errors[failure];
}

export function StaffReplyComposer({
  customerDisplayName,
  initialConversationCursor,
  initialMessages,
  inquiryId,
  labels,
  locale,
  teamMemberNames,
  canReply,
}: Readonly<{
  customerDisplayName: string;
  initialConversationCursor: number;
  initialMessages: readonly StaffConversationMessageDto[];
  inquiryId: string;
  labels: StaffReplyComposerLabels;
  locale: Locale;
  teamMemberNames: Readonly<Record<string, string>>;
  canReply: boolean;
}>) {
  const router = useRouter();
  const textareaId = useId();
  const descriptionId = useId();
  const feedbackId = useId();
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const submissionInFlight = useRef(false);
  const mounted = useRef(true);
  const typingHeartbeat = useRef<ConversationTypingHeartbeat | null>(null);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [state, dispatch] = useReducer(
    staffReplyReducer,
    {conversationCursor: initialConversationCursor, messages: initialMessages},
    createInitialStaffReplyState,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      controller.current = null;
      submissionInFlight.current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = subscribeToStaffConversation({
      inquiryId,
      afterCursor: initialConversationCursor,
      onCustomerTyping: setCustomerTyping,
      onMessage: ({cursor, message}) => dispatch({type: "conversation_message_received", cursor, message}),
    });
    return () => subscription?.close();
  }, [inquiryId, initialConversationCursor]);

  useEffect(() => {
    if (!canReply) return;
    const heartbeat = new ConversationTypingHeartbeat((isTyping) => sendStaffConversationTyping(inquiryId, isTyping));
    typingHeartbeat.current = heartbeat;
    return () => {
      heartbeat.dispose();
      if (typingHeartbeat.current === heartbeat) typingHeartbeat.current = null;
    };
  }, [canReply, inquiryId]);

  useEffect(() => {
    dispatch({type: "translation_snapshot", messages: initialMessages});
  }, [initialMessages]);

  const pendingTranslations = state.messages.some((message) => message.translation?.translations.some((value) => value.status === "PENDING" || value.status === "RUNNING"));
  useEffect(() => {
    if (!pendingTranslations) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [pendingTranslations, router]);

  async function submit() {
    if (submissionInFlight.current) return;
    const draftFailure = staffReplyDraftFailure(state.draft);
    if (draftFailure) {
      dispatch({type: "submission_failed", failure: draftFailure});
      return;
    }

    let clientMessageId = state.clientMessageId;
    if (clientMessageId === null) {
      try { clientMessageId = createStaffClientMessageId(); }
      catch {
        dispatch({type: "submission_failed", failure: "service_unavailable"});
        return;
      }
    }
    const activeController = new AbortController();
    controller.current = activeController;
    submissionInFlight.current = true;
    dispatch({type: "submission_started", clientMessageId});
    const result = await sendStaffConversationReply({
      inquiryId,
      body: state.draft,
      clientMessageId,
    }, activeController.signal);

    const active = controller.current === activeController;
    if (active) {
      controller.current = null;
      submissionInFlight.current = false;
    }
    if (!mounted.current || !active) return;

    if (result.status === "sent") {
      typingHeartbeat.current?.stop();
      dispatch({type: "submission_succeeded", message: result.message});
      router.refresh();
      requestAnimationFrame(() => textarea.current?.focus());
      return;
    }

    dispatch({
      type: "submission_failed",
      failure: result.failure,
      discardClientMessageId: result.failure === "retry_conflict",
    });
    if (result.failure === "session_expired") {
      router.replace("/staff/login");
      router.refresh();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const sending = state.status === "sending";
  const feedback = state.failure
    ? errorMessage(state.failure, labels)
    : state.status === "success"
      ? labels.sent
      : null;

  return (
    <div className="min-w-0">
      <StaffConversationMessageList
        inquiryId={inquiryId} canReply={canReply} onTranslationResolved={() => router.refresh()}
        customerDisplayName={customerDisplayName}
        labels={labels}
        locale={locale}
        messages={state.messages}
        teamMemberNames={teamMemberNames}
      />

      <ConversationTypingIndicator active={customerTyping} label={labels.customerTyping} />

      {canReply ? <div className="my-5 border-t border-stone-200" /> : null}

      {canReply ? <form onSubmit={handleSubmit} noValidate className="min-w-0">
        <h3 className="text-base font-bold text-stone-950">{labels.replyToCustomer}</h3>
        {labels.translation ? <p className="mt-2 text-sm">{labels.translation.authoring}</p> : null}
        <label htmlFor={textareaId} className="mt-4 block text-sm font-semibold text-stone-800">{labels.writeReply}</label>
        <textarea
          ref={textarea}
          id={textareaId}
          name="staff-reply"
          value={state.draft}
          required
          rows={6}
          disabled={sending}
          aria-describedby={`${descriptionId}${feedback ? ` ${feedbackId}` : ""}`}
          aria-invalid={state.failure ? true : undefined}
          onChange={(event) => { typingHeartbeat.current?.draftChanged(event.target.value); dispatch({type: "draft_changed", value: event.target.value}); }}
          onKeyDown={handleKeyDown}
          className="mt-2 min-h-36 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-start text-base leading-7 text-stone-950 outline-none transition focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20 disabled:cursor-wait disabled:bg-stone-100 disabled:opacity-70 motion-reduce:transition-none"
        />
        <div id={descriptionId} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-stone-500">
          <span>{labels.keyboardHint}</span>
          <span aria-label={labels.characters}>{state.draft.length.toLocaleString(locale)} / {messageBodyMaxLength.toLocaleString(locale)}</span>
        </div>
        {feedback ? (
          <p id={feedbackId} role={state.failure ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-xl border px-4 py-3 text-sm leading-6 ${state.failure ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            {feedback}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={sending}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white outline-none transition hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65 sm:w-auto sm:min-w-36 motion-reduce:transition-none"
        >
          {sending ? labels.sending : labels.sendReply}
        </button>
      </form> : null}
    </div>
  );
}
