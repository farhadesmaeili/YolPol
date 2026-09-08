"use client";

import {useLayoutEffect, useRef, type FormEvent} from "react";
import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";

export function shouldSendCustomerMessageOnEnter(event: Readonly<{key: string; shiftKey: boolean; nativeEvent: Readonly<{isComposing: boolean; keyCode: number}>}>, desktop: boolean): boolean {
  return desktop && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229;
}

export function MessageInput({draft, label, placeholder, sendLabel, sendingLabel, submitting, errorId, invalid, onDraftChange, onSubmit}: {draft: string; label: string; placeholder: string; sendLabel: string; sendingLabel: string; submitting: boolean; errorId: string; invalid: boolean; onDraftChange: (value: string) => void; onSubmit: () => void}) {
  const inputId = `${errorId}-input`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!submitting && draft.trim()) onSubmit(); };
  return <form noValidate onSubmit={submit} className="chat-composer sticky bottom-0 z-10 border-t border-border bg-surface px-3 pt-3 sm:px-5">
    <div className="flex min-w-0 items-end gap-2 rounded-2xl border border-border bg-background/60 p-2 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10 motion-reduce:transition-none">
      <label htmlFor={inputId} className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <textarea ref={inputRef} id={inputId} name="message" dir="auto" rows={1} required maxLength={messageBodyMaxLength} value={draft} placeholder={placeholder} readOnly={submitting} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => {
          if (shouldSendCustomerMessageOnEnter(event, window.matchMedia("(hover: hover) and (pointer: fine)").matches)) {event.preventDefault(); if (!submitting && draft.trim()) onSubmit();}
        }} className="block max-h-40 min-h-11 w-full min-w-0 resize-none bg-transparent px-2 py-3 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground read-only:opacity-60" />
      </label>
      <button type="submit" disabled={submitting || !draft.trim()} aria-label={submitting ? sendingLabel : sendLabel} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white outline-none transition hover:brightness-110 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 motion-reduce:transition-none">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5 rtl:-scale-x-100"><path d="m4 4 17 8-17 8 3-8zM7 12h14" /></svg>
      </button>
    </div>
  </form>;
}
