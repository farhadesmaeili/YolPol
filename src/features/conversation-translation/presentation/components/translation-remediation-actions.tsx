"use client";

import {useState} from "react";
import type {MessageTranslationView} from "@/features/conversation-translation/domain/types/translation";
import type {TranslationRemediation} from "@/features/conversation-translation/domain/types/translation-remediation";
import type {TranslationLabels} from "@/features/conversation-translation/presentation/components/message-translation";
import {isSupportedLocale, type Locale} from "@/shared/types/locale";

export function TranslationRemediationActions({inquiryId, messageId, value, outbound, canConfirmSource, labels, onResolved}: Readonly<{
  inquiryId: string; messageId: string; value: MessageTranslationView; outbound: boolean; canConfirmSource: boolean; labels: TranslationLabels; onResolved?: () => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [source, setSource] = useState<Locale | "">("");
  const expectedVersion = value.version;
  if (!expectedVersion || value.deliveryState === "SKIPPED") return null;
  const ready = value.sourceLocale && value.customerTargetLocale && (value.sourceLocale === value.customerTargetLocale
    || value.translations.some((t) => t.targetLocale === value.customerTargetLocale && t.status === "SUCCEEDED"));
  async function act(payload: TranslationRemediation) {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/staff/inquiries/${encodeURIComponent(inquiryId)}/messages/${encodeURIComponent(messageId)}/translation`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
      });
      if (!response.ok) { setError(true); setBusy(false); }
      // Keep controls disabled until the refreshed version replaces this component.
      onResolved?.();
    } catch { setError(true); setBusy(false); }
  }
  return <div className="mt-2 flex flex-wrap items-center gap-2" aria-busy={busy}>
    {value.translations.filter((t) => t.status === "FAILED" || t.status === "CANCELLED").map((t) => <button type="button" key={t.targetLocale}
      disabled={busy} onClick={() => void act({action: "RETRY", expectedVersion, targetLocale: t.targetLocale})}
      className="rounded border border-stone-400 px-3 py-2 disabled:opacity-50">{labels.retry} · {labels.languages[t.targetLocale]}</button>)}
    {outbound && canConfirmSource && !value.sourceLocale ? <label className="flex flex-wrap items-center gap-2">{labels.sourceLanguage}
      <select value={source} disabled={busy} onChange={(event) => setSource(isSupportedLocale(event.target.value) ? event.target.value : "")} className="rounded border border-stone-400 p-2">
        <option value="">{labels.selectLanguage}</option>
        {(["en", "tr", "fa", "ar"] as const).map((locale) => <option key={locale} value={locale}>{labels.languages[locale]}</option>)}
      </select>
      <button type="button" disabled={busy || !source} onClick={() => { if (source) void act({action: "CONFIRM_LANGUAGE", expectedVersion, sourceLocale: source}); }} className="rounded border border-stone-400 px-3 py-2 disabled:opacity-50">{labels.confirmLanguage}</button>
    </label> : null}
    {outbound && !ready ? confirmSkip ? <>
      <span>{labels.skipWarning}</span>
      <button type="button" disabled={busy} onClick={() => void act({action: "SKIP", expectedVersion})} className="rounded border border-red-700 px-3 py-2">{labels.confirmSkip}</button>
      <button type="button" disabled={busy} onClick={() => setConfirmSkip(false)} className="rounded border px-3 py-2">{labels.cancelAction}</button>
    </> : <button type="button" disabled={busy} onClick={() => setConfirmSkip(true)} className="rounded border border-stone-400 px-3 py-2">{labels.skip}</button> : null}
    {error ? <p role="alert">{labels.actionError}</p> : null}
  </div>;
}
