import type {MessageTranslationView} from "@/features/conversation-translation/domain/types/translation";
import type {Locale} from "@/shared/types/locale";
import {TranslationRemediationActions} from "@/features/conversation-translation/presentation/components/translation-remediation-actions";

export type TranslationLabels = Readonly<{
  original: string; translation: string; pending: string; failed: string; ready: string; sameLanguage: string; unknown: string; authoring: string;
  blocked: string; cancelled: string; skipped: string; retry: string; skip: string; confirmSkip: string; skipWarning: string;
  cancelAction: string; actionError: string; sourceLanguage: string; selectLanguage: string; confirmLanguage: string;
  languages: Readonly<Record<Locale, string>>;
}>;

export function MessageTranslation({value, labels, outbound = Boolean(value.customerTargetLocale), canConfirmSource = true, inquiryId, messageId, canReply, onResolved}: Readonly<{
  value: MessageTranslationView; labels: TranslationLabels; outbound?: boolean; canConfirmSource?: boolean; inquiryId?: string; messageId?: string; canReply?: boolean; onResolved?: () => void;
}>) {
  const skipped = value.deliveryState === "SKIPPED";
  const ready = value.sourceLocale && value.customerTargetLocale && (value.sourceLocale === value.customerTargetLocale || value.translations.some((t) => t.targetLocale === value.customerTargetLocale && t.status === "SUCCEEDED"));
  return <div className="mt-3 space-y-2 text-sm" aria-live="polite">
    {skipped ? <p className="font-semibold">{labels.skipped}</p> : outbound && !ready ? <p className="font-semibold text-amber-900">{labels.blocked}</p> : null}
    {!skipped && value.customerTargetLocale && value.sourceLocale === value.customerTargetLocale ? <p className="text-xs">{labels.sameLanguage}</p> : null}
    {value.translations.map((translation) => <div key={translation.targetLocale}>
      <p className="font-semibold">{labels.translation} · {labels.languages[translation.targetLocale]}</p>
      {translation.status === "SUCCEEDED" ? <>
        <p lang={translation.targetLocale} dir={translation.targetLocale === "fa" || translation.targetLocale === "ar" ? "rtl" : "ltr"} className="whitespace-pre-wrap break-words">{translation.body}</p>
        {!skipped && translation.targetLocale === value.customerTargetLocale ? <p className="text-xs">{labels.ready}</p> : null}
      </> : <p>{translation.status === "PENDING" || translation.status === "RUNNING" ? labels.pending : translation.status === "CANCELLED" ? labels.cancelled : labels.failed}</p>}
    </div>)}
    {outbound && !value.sourceLocale && !skipped ? <p>{labels.unknown}</p> : null}
    {canReply && inquiryId && messageId && !skipped ? <TranslationRemediationActions key={value.version} inquiryId={inquiryId} messageId={messageId} value={value} outbound={outbound} canConfirmSource={canConfirmSource} labels={labels} onResolved={onResolved} /> : null}
  </div>;
}
