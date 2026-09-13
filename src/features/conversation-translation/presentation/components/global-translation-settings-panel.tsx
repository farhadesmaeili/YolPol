"use client";

import {useState, useTransition} from "react";
import type {GlobalTranslationDefaultsDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";
import {updateGlobalTranslationDefaults} from "@/features/conversation-translation/presentation/clients/translation-control-client";
import {useRouter} from "@/i18n/navigation";

export type GlobalTranslationSettingsLabels = Readonly<{
  eyebrow: string; title: string; description: string; inherited: string; customerToStaff: string; customerToStaffDescription: string;
  staffToCustomer: string; staffToCustomerDescription: string; aiToStaff: string; aiToStaffDescription: string; safetyTitle: string;
  safety: string; auto: string; manual: string; onDemand: string; save: string; saving: string; saved: string; error: string; readOnly: string;
}>;

export function GlobalTranslationSettingsPanel({initialDefaults, mayManage, labels}: Readonly<{initialDefaults: GlobalTranslationDefaultsDto; mayManage: boolean; labels: GlobalTranslationSettingsLabels}>) {
  const router = useRouter();
  const [draft, setDraft] = useState<ConversationTranslationPolicy>(() => ({
    customerToStaffMode: initialDefaults.customerToStaffMode,
    staffToCustomerMode: initialDefaults.staffToCustomerMode,
    aiToStaffMode: initialDefaults.aiToStaffMode,
  }));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const options = (field: keyof ConversationTranslationPolicy, modes: readonly ConversationTranslationPolicy[keyof ConversationTranslationPolicy][], title: string, description: string) => <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
    <legend className="px-1 text-base font-bold text-stone-950">{title}</legend><p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>
    <div className="mt-4 flex flex-wrap gap-2">{modes.map((mode) => <button key={mode} type="button" aria-pressed={draft[field] === mode} disabled={!mayManage || pending} onClick={() => {setDraft((value) => ({...value, [field]: mode})); setStatus("idle");}} className={`min-h-11 rounded-xl border px-5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60 ${draft[field] === mode ? "border-emerald-900 bg-emerald-900 text-white" : "border-stone-300 bg-stone-50 text-stone-800"}`}>{mode === "AUTO" ? labels.auto : mode === "MANUAL" ? labels.manual : labels.onDemand}</button>)}</div>
  </fieldset>;
  const save = () => startTransition(async () => {
    setStatus("idle");
    try { await updateGlobalTranslationDefaults({...draft, expectedVersion: initialDefaults.version}); setStatus("saved"); router.refresh(); }
    catch { setStatus("error"); }
  });
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">{labels.eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-tight text-stone-950 sm:text-4xl">{labels.title}</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">{labels.description}</p></header>
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-700">{labels.inherited}</div>
    <div className="grid gap-4 lg:grid-cols-3">
      {options("customerToStaffMode", ["AUTO", "MANUAL"], labels.customerToStaff, labels.customerToStaffDescription)}
      {options("staffToCustomerMode", ["AUTO", "MANUAL"], labels.staffToCustomer, labels.staffToCustomerDescription)}
      {options("aiToStaffMode", ["AUTO", "ON_DEMAND"], labels.aiToStaff, labels.aiToStaffDescription)}
    </div>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">{labels.safetyTitle}</h2><p className="mt-2 text-sm leading-6 text-amber-950">{labels.safety}</p></section>
    {!mayManage ? <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">{labels.readOnly}</p> : <button type="button" disabled={pending} onClick={save} className="min-h-12 rounded-xl bg-emerald-900 px-6 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60">{pending ? labels.saving : labels.save}</button>}
    {status === "saved" ? <p role="status" className="text-sm font-semibold text-emerald-800">{labels.saved}</p> : null}
    {status === "error" ? <p role="alert" className="text-sm font-semibold text-red-700">{labels.error}</p> : null}
  </div>;
}
