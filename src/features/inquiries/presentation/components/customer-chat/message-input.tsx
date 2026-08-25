import type {FormEvent} from "react";

import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";

export function MessageInput({draft, label, placeholder, sendLabel, sendingLabel, submitting, errorId, invalid, onDraftChange, onSubmit}: {draft: string; label: string; placeholder: string; sendLabel: string; sendingLabel: string; submitting: boolean; errorId: string; invalid: boolean; onDraftChange: (value: string) => void; onSubmit: () => void}) {
  const inputId = `${errorId}-input`;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSubmit(); };
  return <form noValidate onSubmit={submit} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
    <label htmlFor={inputId} className="grid min-w-0 gap-2 text-sm font-medium text-stone-800">
      <span>{label}</span>
      <textarea id={inputId} name="message" rows={3} required maxLength={messageBodyMaxLength} value={draft} placeholder={placeholder} disabled={submitting} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={(event) => onDraftChange(event.target.value)} className="min-h-28 w-full min-w-0 resize-y border border-stone-950/15 bg-white/75 px-4 py-3 text-stone-950 outline-none transition-colors placeholder:text-stone-400 focus:border-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none" />
    </label>
    <button type="submit" disabled={submitting} className="min-h-12 w-full bg-emerald-950 px-6 font-semibold text-white outline-none transition-colors hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none sm:w-auto">{submitting ? sendingLabel : sendLabel}</button>
  </form>;
}
