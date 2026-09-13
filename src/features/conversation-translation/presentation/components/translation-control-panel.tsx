"use client";

import {useState, useTransition} from "react";
import type {ConversationTranslationControlDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";
import {removeConversationTranslationOverride, setConversationTranslationOverride} from "@/features/conversation-translation/presentation/clients/translation-control-client";
import {useRouter} from "@/i18n/navigation";

export type TranslationControlLabels = Readonly<{
  title: string; description: string; usingGlobal: string; usingOverride: string; effective: string; customize: string; reset: string;
  customerToStaff: string; customerToStaffDescription: string; staffToCustomer: string; staffToCustomerDescription: string;
  aiToStaff: string; aiToStaffDescription: string; safety: string; auto: string; manual: string; onDemand: string;
  working: string; error: string;
}>;

function modeLabel(mode: ConversationTranslationPolicy[keyof ConversationTranslationPolicy], labels: TranslationControlLabels) {
  return mode === "AUTO" ? labels.auto : mode === "MANUAL" ? labels.manual : labels.onDemand;
}

function ModeButton({active, disabled, label, onClick}: Readonly<{active: boolean; disabled: boolean; label: string; onClick(): void}>) {
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick}
    className={`min-h-11 rounded-xl border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60 ${active ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-300 bg-white text-stone-800"}`}>{label}</button>;
}

export function TranslationControlPanel({inquiryId, initialControl, canControl, labels}: Readonly<{
  inquiryId: string; initialControl: ConversationTranslationControlDto; canControl: boolean; labels: TranslationControlLabels;
}>) {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const editable = initialControl.override ?? initialControl.effective;
  const version = initialControl.override?.version ?? 0;
  const run = (operation: () => Promise<unknown>) => startTransition(async () => {
    setError(false);
    try { await operation(); router.refresh(); } catch { setError(true); }
  });
  const change = (patch: Partial<ConversationTranslationPolicy>) => run(() => setConversationTranslationOverride({...editable, ...patch, inquiryId, expectedVersion: version}));

  return <section aria-label={labels.title} className="space-y-4">
    <p className="text-sm leading-6 text-stone-600">{labels.description}</p>
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">{initialControl.source === "GLOBAL" ? labels.usingGlobal : labels.usingOverride}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{labels.effective}</p>
      <dl className="mt-2 grid gap-2 text-sm">
        <div className="flex justify-between gap-3"><dt>{labels.customerToStaff}</dt><dd className="font-semibold">{modeLabel(initialControl.effective.customerToStaffMode, labels)}</dd></div>
        <div className="flex justify-between gap-3"><dt>{labels.staffToCustomer}</dt><dd className="font-semibold">{modeLabel(initialControl.effective.staffToCustomerMode, labels)}</dd></div>
        <div className="flex justify-between gap-3"><dt>{labels.aiToStaff}</dt><dd className="font-semibold">{modeLabel(initialControl.effective.aiToStaffMode, labels)}</dd></div>
      </dl>
    </div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">{labels.safety}</p>
    {initialControl.override === null ? (
      canControl ? <button type="button" disabled={pending} onClick={() => change({})} className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60">{pending ? labels.working : labels.customize}</button> : null
    ) : <details className="rounded-xl border border-stone-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{labels.customize}</summary>
      <div className="mt-4 space-y-4">
        {([
          ["customerToStaffMode", labels.customerToStaff, labels.customerToStaffDescription, ["AUTO", "MANUAL"]],
          ["staffToCustomerMode", labels.staffToCustomer, labels.staffToCustomerDescription, ["AUTO", "MANUAL"]],
          ["aiToStaffMode", labels.aiToStaff, labels.aiToStaffDescription, ["AUTO", "ON_DEMAND"]],
        ] as const).map(([field, title, description, modes]) => <fieldset key={field} className="space-y-2">
          <legend className="text-sm font-semibold text-stone-900">{title}</legend><p className="text-xs leading-5 text-stone-600">{description}</p>
          <div className="flex flex-wrap gap-2">{modes.map((mode) => <ModeButton key={mode} active={editable[field] === mode} disabled={!canControl || pending} label={modeLabel(mode, labels)} onClick={() => change({[field]: mode})} />)}</div>
        </fieldset>)}
        {canControl ? <button type="button" disabled={pending} onClick={() => run(() => removeConversationTranslationOverride({inquiryId, expectedVersion: version}))} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60">{pending ? labels.working : labels.reset}</button> : null}
      </div>
    </details>}
    {error ? <p role="alert" className="text-sm font-medium text-red-700">{labels.error}</p> : null}
  </section>;
}
