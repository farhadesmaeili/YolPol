"use client";

import {useState, type FormEvent} from "react";

import type {AiOperationsPolicyEventDto, AiOperationsStatusDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import {maximumAiScheduleWindows} from "@/features/ai-operations/domain/value-objects/ai-schedule";
import {aiOperationsModes, aiOperationsWeekdays, type AiOperationsMode, type AiOperationsWeekday, type AiScheduleWindow} from "@/features/ai-operations/domain/types/ai-operations-types";
import {updateAiOperationsPolicy} from "@/features/ai-operations/presentation/clients/ai-operations-client";
import {presentAiOperationsUpdate} from "@/features/ai-operations/presentation/state/ai-operations-update-state";
import {useRouter} from "@/i18n/navigation";
import type {Locale} from "@/shared/types/locale";

export type AiOperationsControlPanelLabels = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  configuredState: string;
  effectiveState: string;
  effectiveAllowed: string;
  effectiveBlocked: string;
  eligibilityNotice: string;
  noPolicy: string;
  emergencyOverride: string;
  emergencyStates: Readonly<Record<"INACTIVE" | "ACTIVE" | "INVALID", string>>;
  decisionReasons: Readonly<Record<AiOperationsStatusDto["effectiveDecision"]["reason"], string>>;
  mode: string;
  modes: Readonly<Record<AiOperationsMode, string>>;
  businessTimeZone: string;
  gracePeriodMinutes: string;
  schedule: string;
  scheduleDescription: string;
  weekday: string;
  weekdays: Readonly<Record<AiOperationsWeekday, string>>;
  start: string;
  end: string;
  enabled: string;
  addWindow: string;
  removeWindow: string;
  version: string;
  updatedAt: string;
  updatedBy: string;
  notAvailable: string;
  confirmEligibility: string;
  save: string;
  disableImmediately: string;
  saving: string;
  saved: string;
  errors: Readonly<Record<"invalid" | "conflict" | "forbidden" | "rate_limited" | "failed" | "confirmation", string>>;
  readOnly: string;
  auditTitle: string;
  auditDescription: string;
  auditEmpty: string;
  eventTypes: Readonly<Record<AiOperationsPolicyEventDto["eventType"], string>>;
  previousVersion: string;
  newVersion: string;
}>;

type EditableWindow = Readonly<{id: number; weekday: AiOperationsWeekday; startMinute: number; endMinute: number; enabled: boolean}>;

function minuteToTime(value: number): string {
  const normalized = value === 1_440 ? 0 : value;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string): number | null {
  if (!/^\d{2}:\d{2}$/u.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isInteger(hour) && hour! >= 0 && hour! <= 23 && Number.isInteger(minute) && minute! >= 0 && minute! <= 59
    ? hour! * 60 + minute!
    : null;
}

export function AiOperationsControlPanel({status, events, mayManage, locale, labels}: Readonly<{
  status: AiOperationsStatusDto;
  events: readonly AiOperationsPolicyEventDto[];
  mayManage: boolean;
  locale: Locale;
  labels: AiOperationsControlPanelLabels;
}>) {
  const router = useRouter();
  const policy = status.policy;
  const [mode, setMode] = useState<AiOperationsMode>(policy?.mode ?? "DISABLED");
  const [businessTimeZone, setBusinessTimeZone] = useState(policy?.businessTimeZone ?? "Asia/Tehran");
  const [graceMinutes, setGraceMinutes] = useState(policy ? String(policy.humanGracePeriodSeconds / 60) : "15");
  const [windows, setWindows] = useState<readonly EditableWindow[]>(() => (policy?.scheduleWindows ?? []).map((window, id) => ({id, ...window})));
  const [nextWindowId, setNextWindowId] = useState(windows.length);
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<"saved" | keyof AiOperationsControlPanelLabels["errors"] | null>(null);

  function updateWindow(id: number, change: Partial<Omit<EditableWindow, "id">>) {
    setWindows((current) => current.map((window) => window.id === id ? {...window, ...change} : window));
  }

  function addWindow() {
    if (windows.length >= maximumAiScheduleWindows) return;
    setWindows((current) => [...current, {id: nextWindowId, weekday: "MONDAY", startMinute: 9 * 60, endMinute: 17 * 60, enabled: true}]);
    setNextWindowId((current) => current + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    if (mode !== "DISABLED" && !confirmed) { setNotice("confirmation"); return; }
    const grace = Number(graceMinutes);
    const graceSeconds = grace * 60;
    if (!Number.isSafeInteger(graceSeconds) || graceSeconds < 60 || graceSeconds > 86_400) { setNotice("invalid"); return; }
    setWorking(true);
    setNotice(null);
    const result = await updateAiOperationsPolicy(fetch, {
      expectedVersion: policy?.version ?? 0,
      mode,
      businessTimeZone,
      humanGracePeriodSeconds: graceSeconds,
      scheduleWindows: windows.map((window): AiScheduleWindow => ({
        weekday: window.weekday,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        enabled: window.enabled,
      })),
    });
    setWorking(false);
    const presentation = presentAiOperationsUpdate(result);
    setNotice(presentation.notice);
    if (!presentation.refresh) return;
    setConfirmed(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">{labels.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{labels.title}</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{labels.description}</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2" aria-label={labels.effectiveState}>
        <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{labels.effectiveState}</p>
          <p className={`mt-3 text-2xl font-bold ${status.effectiveDecision.allowed ? "text-emerald-800" : "text-red-800"}`}>{status.effectiveDecision.allowed ? labels.effectiveAllowed : labels.effectiveBlocked}</p>
          <p className="mt-2 text-sm text-stone-600">{labels.decisionReasons[status.effectiveDecision.reason]}</p>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">{labels.eligibilityNotice}</p>
        </article>
        <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{labels.emergencyOverride}</p>
          <p className={`mt-3 text-xl font-bold ${status.emergencyOverride.active ? "text-red-800" : "text-emerald-800"}`}>{labels.emergencyStates[status.emergencyOverride.state]}</p>
          <p className="mt-4 text-sm text-stone-600">{labels.configuredState}: {policy ? labels.modes[policy.mode] : labels.noPolicy}</p>
        </article>
      </section>

      <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="ai-policy-form-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="ai-policy-form-title" className="text-xl font-bold">{labels.configuredState}</h2>{!mayManage ? <p className="mt-2 text-sm text-stone-600">{labels.readOnly}</p> : null}</div>
          <dl className="grid gap-x-5 gap-y-1 text-xs text-stone-600 sm:grid-cols-3">
            <div><dt className="font-semibold">{labels.version}</dt><dd>{policy?.version ?? 0}</dd></div>
            <div><dt className="font-semibold">{labels.updatedAt}</dt><dd>{policy ? new Date(policy.updatedAt).toLocaleString(locale, {timeZone: "UTC", timeZoneName: "short"}) : labels.notAvailable}</dd></div>
            <div><dt className="font-semibold">{labels.updatedBy}</dt><dd dir="ltr">{policy?.updatedBy ?? labels.notAvailable}</dd></div>
          </dl>
        </div>
        <fieldset disabled={!mayManage || working} className="mt-6 grid gap-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={labels.mode}><select value={mode} onChange={(event) => { setMode(event.target.value as AiOperationsMode); setConfirmed(false); }} className={inputClass}>{aiOperationsModes.map((value) => <option key={value} value={value}>{labels.modes[value]}</option>)}</select></Field>
            <Field label={labels.businessTimeZone}><input dir="ltr" value={businessTimeZone} onChange={(event) => setBusinessTimeZone(event.target.value)} maxLength={64} required className={inputClass} /></Field>
            <Field label={labels.gracePeriodMinutes}><input dir="ltr" type="number" min={1} max={1_440} step="any" value={graceMinutes} onChange={(event) => setGraceMinutes(event.target.value)} required className={inputClass} /></Field>
          </div>
          <section aria-labelledby="ai-schedule-title">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="ai-schedule-title" className="font-bold">{labels.schedule}</h3><p className="mt-1 text-sm text-stone-600">{labels.scheduleDescription}</p></div>{mayManage ? <button type="button" onClick={addWindow} disabled={working || windows.length >= maximumAiScheduleWindows} className={secondaryButtonClass}>{labels.addWindow}</button> : null}</div>
            <div className="mt-4 grid gap-3">{windows.map((window) => (
              <div key={window.id} className="grid gap-3 rounded-xl border border-stone-200 p-4 md:grid-cols-[1fr_10rem_10rem_auto_auto] md:items-end">
                <Field label={labels.weekday}><select value={window.weekday} onChange={(event) => updateWindow(window.id, {weekday: event.target.value as AiOperationsWeekday})} className={inputClass}>{aiOperationsWeekdays.map((weekday) => <option key={weekday} value={weekday}>{labels.weekdays[weekday]}</option>)}</select></Field>
                <Field label={labels.start}><input dir="ltr" type="time" value={minuteToTime(window.startMinute)} onChange={(event) => { const minute = timeToMinute(event.target.value); if (minute !== null) updateWindow(window.id, {startMinute: minute}); }} className={inputClass} /></Field>
                <Field label={labels.end}><input dir="ltr" type="time" value={minuteToTime(window.endMinute)} onChange={(event) => { const minute = timeToMinute(event.target.value); if (minute !== null) updateWindow(window.id, {endMinute: minute}); }} className={inputClass} /></Field>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={window.enabled} onChange={(event) => updateWindow(window.id, {enabled: event.target.checked})} />{labels.enabled}</label>
                {mayManage ? <button type="button" onClick={() => setWindows((current) => current.filter((candidate) => candidate.id !== window.id))} className={secondaryButtonClass}>{labels.removeWindow}</button> : null}
              </div>
            ))}</div>
          </section>
          {mode !== "DISABLED" && mayManage ? <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{labels.confirmEligibility}</label> : null}
          {mayManage ? <button type="submit" className={mode === "DISABLED" ? dangerButtonClass : primaryButtonClass}>{working ? labels.saving : mode === "DISABLED" ? labels.disableImmediately : labels.save}</button> : null}
        </fieldset>
        {notice ? <p role={notice === "saved" ? "status" : "alert"} className={`mt-4 rounded-xl p-3 text-sm ${notice === "saved" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{notice === "saved" ? labels.saved : labels.errors[notice]}</p> : null}
      </form>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="ai-audit-title">
        <h2 id="ai-audit-title" className="text-xl font-bold">{labels.auditTitle}</h2><p className="mt-2 text-sm text-stone-600">{labels.auditDescription}</p>
        {events.length === 0 ? <p className="mt-5 text-sm text-stone-500">{labels.auditEmpty}</p> : <ol className="mt-5 grid gap-3">{events.map((event) => (
          <li key={event.id} className="rounded-xl border border-stone-200 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong>{labels.eventTypes[event.eventType]}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString(locale, {timeZone: "UTC", timeZoneName: "short"})}</time></div>
            <p className="mt-2 text-stone-600">{labels.previousVersion}: {event.previousVersion ?? labels.notAvailable} · {labels.newVersion}: {event.newVersion}</p>
            <p className="mt-1 text-stone-600">{labels.mode}: {labels.modes[event.newPolicy.mode]} · {labels.businessTimeZone}: <span dir="ltr">{event.newPolicy.businessTimeZone}</span> · {labels.gracePeriodMinutes}: {event.newPolicy.humanGracePeriodSeconds / 60} · {labels.schedule}: {event.newPolicy.scheduleWindows.length}</p>
            <p className="mt-1 text-stone-600" dir="ltr">{event.actorReference}</p>
          </li>
        ))}</ol>}
      </section>
    </div>
  );
}

function Field({label, children}: Readonly<{label: string; children: React.ReactNode}>) { return <label className="block text-sm font-semibold text-stone-800">{label}<span className="mt-2 block">{children}</span></label>; }
const inputClass = "min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20 disabled:bg-stone-100 disabled:text-stone-600";
const primaryButtonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-900 px-5 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
const dangerButtonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-800 px-5 text-sm font-semibold text-white outline-none hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-700 disabled:opacity-60";
const secondaryButtonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
