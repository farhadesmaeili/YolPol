"use client";

import {useState, useTransition} from "react";

import type {ConversationAiStatusDto} from "@/features/conversation-ai-routing/application/dto/conversation-ai-routing-dto";
import type {ConversationAiControlState, ConversationAiJobStatus} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";
import {updateConversationAiControl} from "@/features/conversation-ai-routing/presentation/clients/conversation-ai-control-client";

export type ConversationAiControlLabels = Readonly<{
  title: string;
  currentState: string;
  states: Readonly<Record<ConversationAiControlState, string>>;
  jobState: string;
  jobs: Readonly<Record<ConversationAiJobStatus, string>>;
  noJob: string;
  pause: string;
  takeover: string;
  resume: string;
  working: string;
  error: string;
}>;

export function ConversationAiControlPanel({inquiryId, initialStatus, canControl, labels}: Readonly<{
  inquiryId: string;
  initialStatus: ConversationAiStatusDto;
  canControl: boolean;
  labels: ConversationAiControlLabels;
}>) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const change = (state: ConversationAiControlState) => startTransition(async () => {
    setError(false);
    try { setStatus(await updateConversationAiControl({inquiryId, state, expectedVersion: status.version})); }
    catch { setError(true); }
  });
  return (
    <section aria-labelledby="conversation-ai-control-title" className="space-y-3">
      <h3 id="conversation-ai-control-title" className="text-sm font-bold text-stone-900">{labels.title}</h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-stone-500">{labels.currentState}</dt><dd className="font-semibold text-stone-900">{labels.states[status.state]}</dd></div>
        <div><dt className="text-xs text-stone-500">{labels.jobState}</dt><dd className="font-semibold text-stone-900">{status.latestJob ? labels.jobs[status.latestJob.status] : labels.noJob}</dd></div>
      </dl>
      {canControl ? <div className="flex flex-wrap gap-2">
        {status.state === "AUTO" ? <>
          <button type="button" disabled={pending} onClick={() => change("PAUSED")} className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold disabled:opacity-60">{pending ? labels.working : labels.pause}</button>
          <button type="button" disabled={pending} onClick={() => change("HUMAN_TAKEOVER")} className="min-h-11 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? labels.working : labels.takeover}</button>
        </> : <button type="button" disabled={pending} onClick={() => change("AUTO")} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? labels.working : labels.resume}</button>}
      </div> : null}
      {error ? <p role="alert" className="text-sm font-medium text-red-700">{labels.error}</p> : null}
    </section>
  );
}
