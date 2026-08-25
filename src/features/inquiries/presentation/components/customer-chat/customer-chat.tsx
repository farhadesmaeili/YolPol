"use client";

import {useEffect, useId, useReducer, useRef} from "react";

import {sendCustomerMessage} from "@/features/inquiries/presentation/clients/customer-message-client";
import {ChatContainer} from "@/features/inquiries/presentation/components/customer-chat/chat-container";
import {ChatErrorState} from "@/features/inquiries/presentation/components/customer-chat/chat-error-state";
import {ChatLoadingState} from "@/features/inquiries/presentation/components/customer-chat/chat-loading-state";
import {MessageInput} from "@/features/inquiries/presentation/components/customer-chat/message-input";
import {MessageList} from "@/features/inquiries/presentation/components/customer-chat/message-list";
import {createInitialCustomerChatState, customerChatReducer, customerMessageDraftFailure, type CustomerChatFailure} from "@/features/inquiries/presentation/state/customer-chat-reducer";
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

export function CustomerChat({inquiryId, labels}: {inquiryId: string; labels: CustomerChatLabels}) {
  const headingId = useId();
  const errorId = useId();
  const activeController = useRef<AbortController | null>(null);
  const submissionInFlight = useRef(false);
  const mounted = useRef(true);
  const [state, dispatch] = useReducer(customerChatReducer, undefined, createInitialCustomerChatState);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeController.current?.abort();
    };
  }, []);

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
    activeController.current = controller;
    dispatch({type: "submission_started"});
    const result = await sendCustomerMessage({inquiryId, message}, controller.signal);
    if (activeController.current === controller) activeController.current = null;
    submissionInFlight.current = false;
    if (!mounted.current) return;

    if (result.status === "created") dispatch({type: "submission_succeeded", message: {id: result.messageId, body: message, sender: "customer"}});
    else dispatch({type: "submission_failed", failure: result.status === "validation_error" ? "validation" : result.status === "rate_limited" ? "rate_limited" : result.status === "network_error" ? "network" : "service"});
  };

  const isSubmitting = state.status === "submitting";
  return <ChatContainer headingId={headingId} title={labels.title} description={labels.description} isBusy={isSubmitting}>
    <MessageList messages={state.messages} label={labels.messages} empty={labels.empty} customerAuthor={labels.customerAuthor} supportAuthor={labels.supportAuthor} />
    {isSubmitting ? <ChatLoadingState message={labels.loading} /> : null}
    {state.failure ? <ChatErrorState id={errorId} title={labels.errorTitle} message={failureMessage(state.failure, labels)} /> : null}
    {state.sentAnnouncement ? <p role="status" className="sr-only">{labels.sent}</p> : null}
    <MessageInput draft={state.draft} label={labels.messageLabel} placeholder={labels.messagePlaceholder} sendLabel={labels.send} sendingLabel={labels.sending} submitting={isSubmitting} errorId={errorId} invalid={state.failure !== null} onDraftChange={(value) => dispatch({type: "draft_changed", value})} onSubmit={() => { void submit(); }} />
  </ChatContainer>;
}
