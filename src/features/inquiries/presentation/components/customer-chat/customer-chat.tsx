"use client";

import {useEffect, useId, useReducer, useRef} from "react";

import {loadCustomerMessageHistory, sendCustomerMessage} from "@/features/inquiries/presentation/clients/customer-message-client";
import {ChatContainer} from "@/features/inquiries/presentation/components/customer-chat/chat-container";
import {ChatErrorState} from "@/features/inquiries/presentation/components/customer-chat/chat-error-state";
import {ChatLoadingState} from "@/features/inquiries/presentation/components/customer-chat/chat-loading-state";
import {MessageInput} from "@/features/inquiries/presentation/components/customer-chat/message-input";
import {MessageList} from "@/features/inquiries/presentation/components/customer-chat/message-list";
import {createInitialCustomerChatState, customerChatReducer, customerMessageDraftFailure, type CustomerChatFailure, type CustomerChatHistoryFailure} from "@/features/inquiries/presentation/state/customer-chat-reducer";
import type {CustomerChatLabels} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

function failureMessage(failure: CustomerChatFailure, labels: CustomerChatLabels): string {
  switch (failure) {
    case "required": return labels.errors.required;
    case "too_long": return labels.errors.tooLong;
    case "validation": return labels.errors.validation;
    case "rate_limited": return labels.errors.rateLimited;
    case "network": return labels.errors.network;
    case "service": return labels.errors.service;
  }
}

function historyFailureMessage(failure: CustomerChatHistoryFailure, labels: CustomerChatLabels): string {
  switch (failure) {
    case "rate_limited": return labels.errors.rateLimited;
    case "network": return labels.errors.network;
    case "service": return labels.errors.history;
  }
}

export function CustomerChat({inquiryId, labels}: {inquiryId: string; labels: CustomerChatLabels}) {
  const headingId = useId();
  const errorId = useId();
  const historyErrorId = useId();
  const activeSubmissionController = useRef<AbortController | null>(null);
  const activeHistoryController = useRef<AbortController | null>(null);
  const submissionInFlight = useRef(false);
  const mounted = useRef(true);
  const [state, dispatch] = useReducer(customerChatReducer, undefined, createInitialCustomerChatState);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    activeHistoryController.current = controller;
    dispatch({type: "history_started"});
    void loadCustomerMessageHistory(inquiryId, controller.signal).then((result) => {
      if (!mounted.current || activeHistoryController.current !== controller) return;
      activeHistoryController.current = null;
      if (result.status === "loaded") dispatch({type: "history_succeeded", messages: result.messages});
      else dispatch({type: "history_failed", failure: result.status === "rate_limited" ? "rate_limited" : result.status === "network_error" ? "network" : "service"});
    });
    return () => {
      mounted.current = false;
      controller.abort();
      if (activeHistoryController.current === controller) activeHistoryController.current = null;
      activeSubmissionController.current?.abort();
      activeSubmissionController.current = null;
      submissionInFlight.current = false;
    };
  }, [inquiryId]);

  const submit = async () => {
    if (submissionInFlight.current) return;
    const draftFailure = customerMessageDraftFailure(state.draft);
    if (draftFailure) {
      dispatch({type: "submission_failed", failure: draftFailure});
      return;
    }

    const message = state.draft.trim();
    const controller = new AbortController();
    submissionInFlight.current = true;
    activeSubmissionController.current = controller;
    dispatch({type: "submission_started"});
    const result = await sendCustomerMessage({inquiryId, message}, controller.signal);
    const isActiveSubmission = activeSubmissionController.current === controller;
    if (isActiveSubmission) {
      activeSubmissionController.current = null;
      submissionInFlight.current = false;
    }
    if (!mounted.current || !isActiveSubmission) return;

    if (result.status === "created") dispatch({type: "submission_succeeded", message: {id: result.messageId, body: message, sender: "customer"}});
    else dispatch({type: "submission_failed", failure: result.status === "validation_error" ? "validation" : result.status === "rate_limited" ? "rate_limited" : result.status === "network_error" ? "network" : "service"});
  };

  const isSubmitting = state.status === "submitting";
  const isLoadingHistory = state.historyStatus === "loading";
  return <ChatContainer headingId={headingId} title={labels.title} description={labels.description} isBusy={isSubmitting || isLoadingHistory}>
    <MessageList messages={state.messages} label={labels.messages} empty={labels.empty} customerAuthor={labels.customerAuthor} supportAuthor={labels.supportAuthor} />
    {isLoadingHistory ? <ChatLoadingState message={labels.loadingHistory} /> : null}
    {isSubmitting ? <ChatLoadingState message={labels.loading} /> : null}
    {state.historyFailure ? <ChatErrorState id={historyErrorId} title={labels.historyErrorTitle} message={historyFailureMessage(state.historyFailure, labels)} /> : null}
    {state.failure ? <ChatErrorState id={errorId} title={labels.errorTitle} message={failureMessage(state.failure, labels)} /> : null}
    {state.sentAnnouncement ? <p role="status" className="sr-only">{labels.sent}</p> : null}
    <MessageInput draft={state.draft} label={labels.messageLabel} placeholder={labels.messagePlaceholder} sendLabel={labels.send} sendingLabel={labels.sending} submitting={isSubmitting} errorId={errorId} invalid={state.failure !== null} onDraftChange={(value) => dispatch({type: "draft_changed", value})} onSubmit={() => { void submit(); }} />
  </ChatContainer>;
}
