"use client";

import {useEffect, useId, useRef, useState} from "react";

import type {AiOperationsPolicyEventDto, AiOperationsStatusDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import {updateAiOperationsPolicy} from "@/features/ai-operations/presentation/clients/ai-operations-client";
import {buildAiEmergencyStopUpdate, presentAiEmergencyStop} from "@/features/ai-operations/presentation/state/ai-emergency-stop-state";
import {presentAiOperationsUpdate, type AiOperationsUpdateNotice} from "@/features/ai-operations/presentation/state/ai-operations-update-state";
import {useRouter} from "@/i18n/navigation";

export type AiEmergencyStopControlLabels = Readonly<{
  title: string;
  activeStatus: string;
  disabledStatus: string;
  activeDescription: string;
  disabledDescription: string;
  environmentDescription: string;
  unconfiguredDescription: string;
  disable: string;
  enable: string;
  enableUnavailable: string;
  disabling: string;
  enabling: string;
  disabled: string;
  enabled: string;
  readOnly: string;
  confirmTitle: string;
  confirmDescription: string;
  cancel: string;
  confirmDisable: string;
  errors: Readonly<Record<Exclude<AiOperationsUpdateNotice, "saved">, string>>;
}>;

export function AiEmergencyStopControl({status, events, mayManage, labels}: Readonly<{
  status: AiOperationsStatusDto;
  events: readonly AiOperationsPolicyEventDto[];
  mayManage: boolean;
  labels: AiEmergencyStopControlLabels;
}>) {
  const router = useRouter();
  const view = presentAiEmergencyStop(status, events);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [working, setWorking] = useState<"DISABLE" | "ENABLE" | null>(null);
  const [notice, setNotice] = useState<"disabled" | "enabled" | Exclude<AiOperationsUpdateNotice, "saved"> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!confirmingDisable) return;
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmingDisable(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !cancelRef.current || !confirmRef.current) return;
      if (event.shiftKey && document.activeElement === cancelRef.current) {
        event.preventDefault();
        confirmRef.current.focus();
      } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
        event.preventDefault();
        cancelRef.current.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmingDisable]);

  function closeConfirmation() {
    setConfirmingDisable(false);
    triggerRef.current?.focus();
  }

  async function mutate(action: "DISABLE" | "ENABLE") {
    if (working || !status.policy) return;
    const mode = action === "DISABLE" ? "DISABLED" : view.resumeMode;
    if (!mode) return;
    setWorking(action);
    setNotice(null);
    const result = await updateAiOperationsPolicy(fetch, buildAiEmergencyStopUpdate(status.policy, mode));
    setWorking(null);
    const presentation = presentAiOperationsUpdate(result);
    if (!presentation.refresh) {
      setNotice(presentation.notice);
      return;
    }
    setConfirmingDisable(false);
    setNotice(action === "DISABLE" ? "disabled" : "enabled");
    router.refresh();
  }

  const stopped = view.state !== "ACTIVE";
  const description = view.state === "ACTIVE"
    ? labels.activeDescription
    : view.state === "ENVIRONMENT_DISABLED"
      ? labels.environmentDescription
      : view.state === "UNCONFIGURED"
        ? labels.unconfiguredDescription
        : labels.disabledDescription;

  return (
    <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${stopped ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`} aria-labelledby="ai-emergency-stop-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="ai-emergency-stop-title" className="text-xl font-bold text-stone-950">{labels.title}</h2>
          <p className={`mt-2 text-2xl font-bold ${stopped ? "text-red-800" : "text-emerald-800"}`} role="status">
            {stopped ? labels.disabledStatus : labels.activeStatus}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">{description}</p>
          {!mayManage ? <p className="mt-3 text-sm font-semibold text-stone-700">{labels.readOnly}</p> : null}
          {mayManage && view.state === "DISABLED" && !view.resumeMode ? <p className="mt-3 text-sm font-semibold text-stone-700">{labels.enableUnavailable}</p> : null}
        </div>
        {mayManage && view.state === "ACTIVE" ? (
          <button ref={triggerRef} type="button" aria-haspopup="dialog" onClick={() => setConfirmingDisable(true)} disabled={working !== null} className={dangerButtonClass}>
            {working === "DISABLE" ? labels.disabling : labels.disable}
          </button>
        ) : null}
        {mayManage && view.state === "DISABLED" && view.resumeMode ? (
          <button type="button" onClick={() => void mutate("ENABLE")} disabled={working !== null} className={primaryButtonClass}>
            {working === "ENABLE" ? labels.enabling : labels.enable}
          </button>
        ) : null}
      </div>

      {notice ? (
        <p role={notice === "disabled" || notice === "enabled" ? "status" : "alert"} className={`mt-4 rounded-xl p-3 text-sm ${notice === "disabled" || notice === "enabled" ? "bg-white/80 text-stone-900" : "bg-red-100 text-red-950"}`}>
          {notice === "disabled" ? labels.disabled : notice === "enabled" ? labels.enabled : labels.errors[notice]}
        </p>
      ) : null}

      {confirmingDisable ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <h3 id={titleId} className="text-xl font-bold text-stone-950">{labels.confirmTitle}</h3>
            <p id={descriptionId} className="mt-3 text-sm leading-6 text-stone-700">{labels.confirmDescription}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button ref={cancelRef} type="button" onClick={closeConfirmation} disabled={working !== null} className={secondaryButtonClass}>{labels.cancel}</button>
              <button ref={confirmRef} type="button" onClick={() => void mutate("DISABLE")} disabled={working !== null} className={dangerButtonClass}>{working === "DISABLE" ? labels.disabling : labels.confirmDisable}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const primaryButtonClass = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-900 px-5 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60";
const dangerButtonClass = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-red-800 px-5 text-sm font-semibold text-white outline-none hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:opacity-60";
const secondaryButtonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60";
