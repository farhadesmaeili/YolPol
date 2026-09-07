"use client";

import {useState, useTransition} from "react";
import type {ConversationTranslationControlDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";
import {updateConversationTranslationControl} from "@/features/conversation-translation/presentation/clients/translation-control-client";
import {useRouter} from "@/i18n/navigation";

export type TranslationControlLabels = Readonly<{
  title: string;
  description: string;
  customerToStaff: string;
  customerToStaffDescription: string;
  staffToCustomer: string;
  staffToCustomerDescription: string;
  aiToStaff: string;
  aiToStaffDescription: string;
  auto: string;
  manual: string;
  onDemand: string;
  working: string;
  error: string;
}>;

function ModeButton({active, disabled, label, onClick}: Readonly<{active: boolean; disabled: boolean; label: string; onClick(): void}>) {
  return <button
    type="button"
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    className={`min-h-11 rounded-xl border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60 ${active ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-300 bg-white text-stone-800"}`}
  >{label}</button>;
}

export function TranslationControlPanel({inquiryId, initialControl, canControl, labels}: Readonly<{
  inquiryId: string;
  initialControl: ConversationTranslationControlDto;
  canControl: boolean;
  labels: TranslationControlLabels;
}>) {
  const router = useRouter();
  const control = initialControl;
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const change = (patch: Partial<ConversationTranslationPolicy>) => startTransition(async () => {
    setError(false);
    try {
      await updateConversationTranslationControl({...control, ...patch, inquiryId, expectedVersion: control.version});
      router.refresh();
    } catch { setError(true); }
  });

  return <section aria-labelledby="translation-control-title" className="space-y-4">
    <div>
      <h3 id="translation-control-title" className="text-sm font-bold text-stone-900">{labels.title}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">{labels.description}</p>
    </div>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-900">{labels.customerToStaff}</legend>
      <p className="text-xs leading-5 text-stone-600">{labels.customerToStaffDescription}</p>
      <div className="flex flex-wrap gap-2">
        <ModeButton active={control.customerToStaffMode === "AUTO"} disabled={!canControl || pending} label={pending ? labels.working : labels.auto} onClick={() => change({customerToStaffMode: "AUTO"})} />
        <ModeButton active={control.customerToStaffMode === "MANUAL"} disabled={!canControl || pending} label={pending ? labels.working : labels.manual} onClick={() => change({customerToStaffMode: "MANUAL"})} />
      </div>
    </fieldset>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-900">{labels.staffToCustomer}</legend>
      <p className="text-xs leading-5 text-stone-600">{labels.staffToCustomerDescription}</p>
      <div className="flex flex-wrap gap-2">
        <ModeButton active={control.staffToCustomerMode === "AUTO"} disabled={!canControl || pending} label={pending ? labels.working : labels.auto} onClick={() => change({staffToCustomerMode: "AUTO"})} />
        <ModeButton active={control.staffToCustomerMode === "MANUAL"} disabled={!canControl || pending} label={pending ? labels.working : labels.manual} onClick={() => change({staffToCustomerMode: "MANUAL"})} />
      </div>
    </fieldset>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-900">{labels.aiToStaff}</legend>
      <p className="text-xs leading-5 text-stone-600">{labels.aiToStaffDescription}</p>
      <div className="flex flex-wrap gap-2">
        <ModeButton active={control.aiToStaffMode === "AUTO"} disabled={!canControl || pending} label={pending ? labels.working : labels.auto} onClick={() => change({aiToStaffMode: "AUTO"})} />
        <ModeButton active={control.aiToStaffMode === "ON_DEMAND"} disabled={!canControl || pending} label={pending ? labels.working : labels.onDemand} onClick={() => change({aiToStaffMode: "ON_DEMAND"})} />
      </div>
    </fieldset>
    {error ? <p role="alert" className="text-sm font-medium text-red-700">{labels.error}</p> : null}
  </section>;
}
