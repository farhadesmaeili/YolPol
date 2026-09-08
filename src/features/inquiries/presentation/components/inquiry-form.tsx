"use client";

import {useEffect, useReducer, useRef, useState} from "react";

import {contactMethods, targetCountries} from "@/features/inquiries/domain/types/inquiry-types";
import type {CustomerInquirySummaryDto} from "@/features/inquiries/application/dto/customer-inquiry-summary-dto";
import {loadCustomerInquirySummary} from "@/features/inquiries/presentation/clients/customer-inquiry-summary-client";
import {InquiryProductImage, InquiryProductPicker} from "@/features/inquiries/presentation/components/inquiry-product-picker";
import {CustomerChat} from "@/features/inquiries/presentation/components/customer-chat/customer-chat";
import {loadCustomerMessageHistory} from "@/features/inquiries/presentation/clients/customer-message-client";
import {mapInquiryDraft, normalizeInquiryPhoneDraft, preselectInquiryProducts} from "@/features/inquiries/presentation/parsers/inquiry-draft-mapper";
import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {createInitialInquiryFormState, inquiryControlId, inquiryErrorId, inquiryFailureFocusId, inquiryFormReducer, type InquiryTextField} from "@/features/inquiries/presentation/state/inquiry-form-reducer";
import type {CustomerChatLabels} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";
import type {InquiryDraftFailure, InquiryDraftLine, InquiryFormLabels, InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

export function inquiryInvalidProps(active: InquiryDraftFailure | null, field: InquiryDraftFailure["field"], itemIndex?: number) {
  return active?.field === field && active.itemIndex === itemIndex ? {"aria-invalid": true as const, "aria-describedby": inquiryErrorId(field, itemIndex)} : {};
}

export function inquiryServerFailure(field: unknown): InquiryDraftFailure | undefined {
  const fields: Readonly<Record<string, InquiryDraftFailure["field"]>> = {"contact.fullName":"fullName","contact.company":"company","contact.email":"email","contact.phone":"phone","contact.whatsappPhone":"whatsappPhone","contact.telegramUsername":"telegramUsername","contact.preferredMethods":"preferredContact","location.country":"country","location.city":"city","destination.country":"destinationCountry","destination.city":"destinationCity",message:"message","privacy.accepted":"privacy",items:"products","items.productId":"products","items.palletCount":"quantity","items.quantity":"quantity","items.unit":"quantityUnit"};
  if (typeof field !== "string") return undefined;
  const indexed = /^items\.(\d+)\.(productId|palletCount|quantity|unit)$/u.exec(field);
  if (indexed) {
    const itemIndex = Number(indexed[1]);
    const mapped = indexed[2] === "productId" ? "products" : indexed[2] === "unit" ? "quantityUnit" : "quantity";
    return {field:mapped,code:"invalid",itemIndex};
  }
  if (!(field in fields)) return undefined;
  const mapped = fields[field];
  return {field:mapped,code:mapped === "privacy" || mapped === "products" ? "required" : "invalid"};
}

export function inquiryFailureMessage(labels: InquiryFormLabels, failure: InquiryDraftFailure): string {
  return failure.code === "destinationDependency" ? labels.errors.destinationDependency : failure.field === "phone" ? labels.errors.phoneInvalid : failure.field === "whatsappPhone" ? labels.errors.whatsappPhoneInvalid : failure.field === "telegramUsername" ? labels.errors.telegramUsernameInvalid : failure.field === "preferredContact" ? labels.errors.preferredContactRequired : failure.field === "quantity" ? (failure.code === "required" ? labels.errors.quantityRequired : failure.code === "tooLarge" ? labels.errors.quantityTooLarge : labels.errors.quantityInvalid) : failure.field === "quantityUnit" ? labels.errors.quantityUnitInvalid : failure.field === "products" ? labels.errors.productsRequired : failure.field === "privacy" ? labels.errors.privacyRequired : labels.errors.invalidField;
}

export function focusInquiryFailure(failure: InquiryDraftFailure, findControl: (id: string) => Pick<HTMLElement, "focus"> | null = (id) => document.getElementById(id)): void {
  findControl(inquiryFailureFocusId(failure))?.focus();
}

export const inquirySubmissionTimeoutMs = 15_000;
type InquiryHttpResult = Readonly<{status:"created";inquiryId:string}> | Readonly<{status:"rejected";code?:string;field?:unknown}>;

export async function parseInquirySubmissionResponse(response: Response): Promise<InquiryHttpResult> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (response.status === 201) {
    if (mediaType !== "application/json") return {status:"rejected"};
    let value: unknown;
    try { value = await response.json(); } catch { return {status:"rejected"}; }
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return {status:"rejected"};
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "inquiryId,status" || record.status !== "created" || typeof record.inquiryId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(record.inquiryId)) return {status:"rejected"};
    return {status:"created",inquiryId:record.inquiryId};
  }
  if (mediaType !== "application/json") return {status:"rejected",code:response.status === 429 ? "rate_limited" : undefined};
  try {
    const value: unknown = await response.json();
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      return {status:"rejected",code:typeof record.code === "string" ? record.code : undefined,field:record.field};
    }
  } catch { /* Invalid responses are generic recoverable failures. */ }
  return {status:"rejected",code:response.status === 429 ? "rate_limited" : undefined};
}

export async function requestInquirySubmission(input: SubmitInquiryInput, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<InquiryHttpResult> {
  const response = await fetcher("/api/inquiries", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal});
  return parseInquirySubmissionResponse(response);
}

export async function requestInquirySubmissionWithTimeout(input: SubmitInquiryInput, controller: AbortController, fetcher: typeof fetch = fetch, timeoutMs = inquirySubmissionTimeoutMs): Promise<InquiryHttpResult> {
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try { return await requestInquirySubmission(input, controller.signal, fetcher); }
  catch (error) { if (timedOut) return {status:"rejected",code:"timeout"}; throw error; }
  finally { clearTimeout(timer); }
}

export function revealInquiryFeedback(feedback: Pick<HTMLElement, "focus" | "getBoundingClientRect" | "scrollIntoView">, viewportHeight: number, reducedMotion: boolean): void {
  feedback.focus({preventScroll: true});
  const bounds = feedback.getBoundingClientRect();
  if (bounds.top < 0 || bounds.bottom > viewportHeight) feedback.scrollIntoView({block: "center", behavior: reducedMotion ? "auto" : "smooth"});
}

export function InquiryForm({locale, products, labels, chatLabels, privacyHref}: {locale: Locale; products: readonly InquiryProductOption[]; labels: InquiryFormLabels; chatLabels: CustomerChatLabels; privacyHref: string}) {
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const submissionInFlight = useRef(false);
  const activeController = useRef<AbortController | null>(null);
  const activeResumeController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [resumedConversation, setResumedConversation] = useState<Readonly<{key: string; messages: readonly CustomerChatMessage[]; summary: CustomerInquirySummaryDto | null}> | null>(null);
  const [state, dispatch] = useReducer(inquiryFormReducer, undefined, () => createInitialInquiryFormState());
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).getAll("product");
    const timer = window.setTimeout(() => dispatch({type: "apply_preselection", lines: preselectInquiryProducts(products, requested)}), 0);
    return () => window.clearTimeout(timer);
  }, [products]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; activeController.current?.abort(); activeResumeController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    activeResumeController.current = controller;
    void Promise.all([loadCustomerMessageHistory(controller.signal), loadCustomerInquirySummary(controller.signal)]).then(([result, summary]) => {
      if (!mounted.current || activeResumeController.current !== controller) return;
      activeResumeController.current = null;
      if (result.status === "loaded") setResumedConversation({key: "resumed", messages: result.messages, summary});
    });
    return () => {
      controller.abort();
      if (activeResumeController.current === controller) activeResumeController.current = null;
    };
  }, []);
  useEffect(() => {
    if (state.feedback !== "succeeded" && (state.feedback !== "failed" || state.failure)) return;
    const feedback = feedbackRef.current;
    if (!feedback) return;
    revealInquiryFeedback(feedback, window.innerHeight, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [state.feedback, state.failure, state.inquiryId]);
  const available = products.filter((product) => !state.lines.some((line) => line.productId === product.id));
  const fieldClass = "rounded-xl aria-invalid:border-red-700 aria-invalid:bg-red-50/40 min-h-12 w-full min-w-0 max-w-full border border-stone-950/15 bg-white/65 px-4 text-stone-950 outline-none transition-colors focus:border-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 motion-reduce:transition-none";
  const isInvalid = (field: InquiryDraftFailure["field"], itemIndex?: number) => state.failure?.field === field && state.failure.itemIndex === itemIndex;
  const invalidProps = (field: InquiryDraftFailure["field"], itemIndex?: number) => inquiryInvalidProps(state.failure, field, itemIndex);
  const fieldError = (field: InquiryDraftFailure["field"], itemIndex?: number) => isInvalid(field, itemIndex) && state.failure ? <FieldError id={inquiryErrorId(field, itemIndex)}>{inquiryFailureMessage(labels,state.failure)}</FieldError> : null;
  const updateField = (field: InquiryTextField, value: string) => dispatch({type: "update_field", field, value});
  const submit = async () => {
    if (submissionInFlight.current) return;
    const result = mapInquiryDraft(state.fields, state.lines, locale);
    if (result.status === "invalid") {
      dispatch({type: "validation_failed", failure: result.failure});
      window.setTimeout(() => focusInquiryFailure(result.failure), 0);
      return;
    }
    submissionInFlight.current = true;
    dispatch({type: "submission_started"});
    const controller = new AbortController();
    activeController.current = controller;
    try {
      const response = await requestInquirySubmissionWithTimeout(result.input, controller);
      if (!mounted.current) return;
      if (response.status === "created") {
        activeResumeController.current?.abort();
        activeResumeController.current = null;
        setResumedConversation(null);
        dispatch({type:"submission_succeeded",inquiryId:response.inquiryId});
      }
      else {
        const serverFailure = response.code === "product_unavailable" || response.code === "validation_failed" ? inquiryServerFailure(response.field) : undefined;
        dispatch({type:"submission_failed",failure:serverFailure,kind:response.code === "rate_limited" ? "rate_limited" : response.code === "timeout" ? "timeout" : "service"});
        if (serverFailure) window.setTimeout(() => focusInquiryFailure(serverFailure), 0);
      }
    } catch { if (mounted.current) dispatch({type:"submission_failed",kind:"service"}); }
    finally { if (activeController.current === controller) activeController.current = null; submissionInFlight.current = false; }
  };
  const toggleProduct = (productId: string) => {
    if (state.lines.some((line) => line.productId === productId)) {
      dispatch({type: "remove_product", productId});
      return;
    }
    dispatch({type: "select_pending_product", productId});
    dispatch({type: "add_product", availableIds: available.map(({id}) => id)});
  };
  const conversationKey = state.feedback === "succeeded" ? state.inquiryId : resumedConversation?.key;
  if (conversationKey) return <div className="inquiry-reveal pt-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div ref={feedbackRef} tabIndex={-1} role="status" className="text-sm font-medium text-brand outline-none">{state.feedback === "succeeded" ? labels.succeeded : chatLabels.description}</div><button type="button" onClick={() => {setResumedConversation(null); dispatch({type: "reset"}); window.setTimeout(() => document.getElementById(inquiryControlId("fullName"))?.focus(), 0);}} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-focus">{labels.newInquiry}</button></div>
    <CustomerChat key={conversationKey} locale={locale} products={products} countries={labels.countries} labels={chatLabels} initialMessages={resumedConversation?.messages} initialSummary={resumedConversation?.summary} />
  </div>;
  return <><form ref={formRef} noValidate className="inquiry-form mt-8 min-w-0 space-y-10 text-start sm:space-y-14" onSubmit={(event) => { event.preventDefault(); void submit(); }} onReset={(event) => { event.preventDefault(); dispatch({type: "reset"}); }}>
    <fieldset disabled={state.feedback === "submitting"} className="min-w-0 space-y-10 sm:space-y-14"><fieldset className="grid min-w-0 gap-5 sm:grid-cols-2"><legend className="mb-2 text-2xl font-semibold">{labels.customer}</legend><p className="mb-2 text-sm leading-6 text-muted-foreground sm:col-span-2">{labels.contactHint}</p>
      <Field label={labels.fullName} error={fieldError("fullName")}><input id={inquiryControlId("fullName")} name="fullName" autoComplete="name" className={fieldClass} required value={state.fields.fullName} onChange={(event) => updateField("fullName", event.target.value)} {...invalidProps("fullName")} /></Field>
      <Field label={labels.company} error={fieldError("company")}><input id={inquiryControlId("company")} name="company" autoComplete="organization" className={fieldClass} value={state.fields.company} onChange={(event) => updateField("company", event.target.value)} {...invalidProps("company")} /></Field>
      <CountryField id={inquiryControlId("country")} label={labels.country} value={state.fields.country} required labels={labels} fieldClass={fieldClass} error={fieldError("country")} invalidProps={invalidProps("country")} onChange={(value) => updateField("country", value)} />
      <Field label={labels.city} error={fieldError("city")}><input id={inquiryControlId("city")} name="city" autoComplete="address-level2" className={fieldClass} value={state.fields.city} onChange={(event) => updateField("city", event.target.value)} {...invalidProps("city")} /></Field>
      <Field label={labels.email} error={fieldError("email")}><input id={inquiryControlId("email")} name="email" type="email" autoComplete="email" dir="ltr" className={fieldClass} required value={state.fields.email} onChange={(event) => updateField("email", event.target.value)} {...invalidProps("email")} /></Field>
      <Field label={labels.phone} error={fieldError("phone")}><InquiryPhoneInput id={inquiryControlId("phone")} name="phone" value={state.fields.phone} field="contact.phone" fieldClass={fieldClass} invalidProps={invalidProps("phone")} onChange={(value) => updateField("phone",value)} /></Field>
      <fieldset id={inquiryControlId("preferredContact")} aria-invalid={isInvalid("preferredContact") || undefined} aria-describedby={`inquiry-preferredContact-requirement${isInvalid("preferredContact") ? ` ${inquiryErrorId("preferredContact")}` : ""}`} tabIndex={-1} className="grid gap-2 sm:col-span-2"><legend className="text-sm">{labels.preferredContact}</legend><p id="inquiry-preferredContact-requirement" className="sr-only">{labels.errors.preferredContactRequired}</p><div className="flex flex-wrap gap-5">{contactMethods.map((method) => <label key={method} className="flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm has-checked:border-brand has-checked:bg-brand/5"><input type="checkbox" checked={state.fields.preferredMethods.includes(method)} onChange={(event) => dispatch({type:"toggle_contact_method",method,selected:event.target.checked})} className="size-5" />{labels.contactMethods[method]}</label>)}</div>{fieldError("preferredContact")}</fieldset>
      {state.fields.preferredMethods.includes("whatsapp") ? <Field label={labels.whatsappPhone} error={fieldError("whatsappPhone")}><InquiryPhoneInput id={inquiryControlId("whatsappPhone")} name="whatsappPhone" value={state.fields.whatsappPhone} field="contact.whatsappPhone" fieldClass={fieldClass} invalidProps={invalidProps("whatsappPhone")} onChange={(value) => updateField("whatsappPhone",value)} /></Field> : null}
      {state.fields.preferredMethods.includes("telegram") ? <Field label={labels.telegramUsername} error={fieldError("telegramUsername")}><input id={inquiryControlId("telegramUsername")} name="telegramUsername" dir="ltr" className={fieldClass} required value={state.fields.telegramUsername} onChange={(event) => updateField("telegramUsername",event.target.value)} {...invalidProps("telegramUsername")} /></Field> : null}
    </fieldset>
    <fieldset id={inquiryControlId("products")} tabIndex={-1} className="min-w-0 border-t border-border pt-7" aria-invalid={isInvalid("products") || undefined} aria-describedby={isInvalid("products") ? inquiryErrorId("products") : undefined}>
      <legend className="pe-4 text-2xl font-semibold">{labels.products}</legend>
      <p className="mb-5 text-sm leading-6 text-muted-foreground">{labels.productSelection.emptyDescription}</p>
      {fieldError("products")}
      {products.length ? <InquiryProductPicker products={products} selectedIds={state.lines.map(({productId}) => productId)} addLabel={labels.productSelection.addProduct} removeLabel={labels.removeProduct} onToggle={toggleProduct} /> : <p role="status">{labels.productUnavailable}</p>}
      <div className="mt-6 divide-y divide-border">{state.lines.map((line, index) => {
        const product = products.find(({id}) => id === line.productId);
        if (!product) return null;
        return <div key={line.productId} className="inquiry-reveal grid min-w-0 gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)] sm:items-center">
          <div className="flex min-w-0 items-center gap-3"><InquiryProductImage product={product} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-6">{product.name}</p><p className="mt-1 text-xs text-muted-foreground"><LtrIsolate>{product.sku}</LtrIsolate></p>{fieldError("products", index)}</div><RemoveProductButton label={`${labels.removeProduct}: ${product.name}`} onRemove={() => {dispatch({type: "remove_product", productId: line.productId}); window.setTimeout(() => document.getElementById(`inquiry-select-${line.productId}`)?.focus(), 0);}} /></div>
          <InquiryProductLineFields line={line} availableUnits={product.availableUnits} index={index} labels={labels} fieldClass={fieldClass} quantityError={fieldError("quantity",index)} unitError={fieldError("quantityUnit",index)} quantityInvalidProps={invalidProps("quantity",index)} unitInvalidProps={invalidProps("quantityUnit",index)} onQuantityChange={(value) => dispatch({type:"change_quantity",index,value})} onUnitChange={(unit) => dispatch({type:"change_unit",index,unit})} />
        </div>;
      })}</div>
    </fieldset>
    <fieldset className="grid gap-5 border-t border-border pt-7 sm:grid-cols-2"><legend className="pe-4 text-2xl font-semibold">{labels.destination}</legend><p className="text-sm leading-6 text-muted-foreground sm:col-span-2">{labels.destinationHint}</p><CountryField id={inquiryControlId("destinationCountry")} label={labels.destinationCountry} value={state.fields.destinationCountry} labels={labels} fieldClass={fieldClass} error={fieldError("destinationCountry")} invalidProps={invalidProps("destinationCountry")} onChange={(value) => updateField("destinationCountry",value)} /><Field label={labels.destinationCity} error={fieldError("destinationCity")}><input id={inquiryControlId("destinationCity")} name="destinationCity" autoComplete="address-level2" className={fieldClass} value={state.fields.destinationCity} onChange={(event) => updateField("destinationCity", event.target.value)} {...invalidProps("destinationCity")} /></Field></fieldset>
    <div className="border-t border-border pt-7"><Field label={labels.message} error={fieldError("message")}><textarea id={inquiryControlId("message")} name="message" rows={3} className={`${fieldClass} resize-y py-3`} value={state.fields.message} onChange={(event) => updateField("message", event.target.value)} {...invalidProps("message")} /><span className="text-sm font-normal leading-6 text-muted-foreground">{labels.detailsHint}</span></Field></div>
    <div className="flex items-start gap-3"><input id={inquiryControlId("privacy")} type="checkbox" required aria-label={labels.privacyAgreement} checked={state.fields.privacyAccepted} onChange={(event) => dispatch({type: "update_consent", value: event.target.checked})} className="mt-1 size-5" {...invalidProps("privacy")} /><span className="text-sm leading-6"><label htmlFor={inquiryControlId("privacy")} className="block">{labels.privacyAgreement}</label><a href={privacyHref} className="font-semibold text-brand underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-focus">{labels.privacyLink}</a>{fieldError("privacy")}</span></div>
    <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-sm text-sm leading-6 text-muted-foreground">{labels.continueHint}</p><button type="submit" disabled={state.feedback === "submitting"} className="min-h-14 rounded-full bg-brand px-7 font-semibold text-white outline-none transition hover:brightness-110 active:scale-[.99] disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4 motion-reduce:transform-none motion-reduce:transition-none">{state.feedback === "submitting" ? labels.submitting : labels.submit}<span aria-hidden="true" className="ms-4 inline-block rtl:rotate-180">&#8594;</span></button></div>
    </fieldset><InquirySubmissionFeedback state={state} labels={labels} feedbackRef={feedbackRef} />
  </form></>;

}

export function InquirySubmissionFeedback({state, labels, feedbackRef}: {state: Pick<ReturnType<typeof createInitialInquiryFormState>, "feedback" | "inquiryId" | "failure" | "submissionFailure">; labels: InquiryFormLabels; feedbackRef?: React.RefObject<HTMLDivElement | null>}) {
  if (state.feedback === "idle") return null;
  if (state.feedback === "succeeded" && state.inquiryId) return <div ref={feedbackRef} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} className="border border-emerald-700 bg-emerald-50 p-5 text-emerald-950 outline-none ring-offset-4 focus-visible:ring-2 focus-visible:ring-emerald-700 sm:p-6"><p className="font-semibold">{labels.succeeded}</p><p className="mt-2 text-sm"><span>{labels.reference}: </span><strong className="font-semibold"><LtrIsolate>{state.inquiryId}</LtrIsolate></strong></p></div>;
  if (state.feedback === "submitting") return <div role="status" aria-live="polite" aria-atomic="true" className="border border-emerald-800/30 bg-emerald-50/70 p-4 font-medium text-emerald-950">{labels.submitting}</div>;
  const message = state.feedback === "invalid" && state.failure ? inquiryFailureMessage(labels,state.failure) : state.failure?.field === "products" ? labels.productUnavailable : state.failure ? inquiryFailureMessage(labels,state.failure) : state.submissionFailure === "timeout" ? `${labels.timeout} ${labels.retry}` : state.submissionFailure === "rate_limited" ? `${labels.rateLimited} ${labels.retry}` : `${labels.serviceFailure} ${labels.retry}`;
  return <div ref={feedbackRef} role="alert" aria-live="assertive" aria-atomic="true" tabIndex={-1} className="border border-red-700 bg-red-50 p-5 font-medium text-red-950 outline-none ring-offset-4 focus-visible:ring-2 focus-visible:ring-red-700 sm:p-6">{message}</div>;
}

export function InquiryProductLineFields({line,availableUnits,index,labels,fieldClass,quantityError,unitError,quantityInvalidProps,unitInvalidProps,onQuantityChange,onUnitChange}: {line:InquiryDraftLine;availableUnits:InquiryProductOption["availableUnits"];index:number;labels:InquiryFormLabels;fieldClass:string;quantityError?:React.ReactNode;unitError?:React.ReactNode;quantityInvalidProps?:Readonly<{"aria-invalid"?:true;"aria-describedby"?:string}>;unitInvalidProps?:Readonly<{"aria-invalid"?:true;"aria-describedby"?:string}>;onQuantityChange:(value:string)=>void;onUnitChange:(unit:InquiryDraftLine["unit"])=>void}) {
  const quantityField = <Field label={availableUnits.length === 1 ? labels.palletCountRequired : labels.quantityRequired} error={quantityError}><input id={inquiryControlId("quantity",index)} required dir="ltr" className={fieldClass} inputMode="numeric" autoComplete="off" value={line.quantityText} onChange={(event)=>onQuantityChange(event.target.value)} {...quantityInvalidProps} /></Field>;
  if (availableUnits.length === 1) return quantityField;
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">{quantityField}<Field label={labels.quantityUnit} error={unitError}><select id={inquiryControlId("quantityUnit",index)} required className={fieldClass} value={line.unit} onChange={(event)=>{const unit=availableUnits.find((candidate)=>candidate===event.target.value);if(unit)onUnitChange(unit);}} {...unitInvalidProps}>{availableUnits.map((unit)=><option key={unit} value={unit}>{labels.units[unit]}</option>)}</select></Field></div>;
}

export function InquiryPhoneInput({id,name,value,field,fieldClass,invalidProps={},onChange}:{id:string;name:string;value:string;field:"contact.phone"|"contact.whatsappPhone";fieldClass:string;invalidProps?:Readonly<{"aria-invalid"?:true;"aria-describedby"?:string}>;onChange:(value:string)=>void}) {
  return <input id={id} name={name} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className={fieldClass} required value={value} onChange={(event)=>onChange(event.target.value)} onBlur={(event)=>onChange(normalizeInquiryPhoneDraft(event.target.value,field))} {...invalidProps} />;
}

function CountryField({id,label,value,required=false,labels,fieldClass,error,invalidProps,onChange}:{id:string;label:string;value:string;required?:boolean;labels:InquiryFormLabels;fieldClass:string;error?:React.ReactNode;invalidProps:Readonly<{"aria-invalid"?:true;"aria-describedby"?:string}>;onChange:(value:string)=>void}) { return <Field label={label} error={error}><select id={id} required={required} autoComplete="country" className={fieldClass} value={value} onChange={(event)=>onChange(event.target.value)} {...invalidProps}><option value="">{labels.countryPlaceholder}</option>{targetCountries.map((country)=><option key={country} value={country}>{labels.countries[country]}</option>)}</select></Field>; }

export function RemoveProductButton({label, onRemove}: {label: string; onRemove: () => void}) { return <button type="button" aria-label={label} onClick={onRemove} className="flex size-11 items-center justify-center shrink-0 rounded-full text-muted-foreground outline-none hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500"><TrashIcon /></button>; }

export function FieldError({id, children}: {id: string; children: React.ReactNode}) { return <span id={id} className="text-sm font-medium text-red-700">{children}</span>; }
function Field({label, children, error, className = ""}: {label: string; children: React.ReactNode; error?: React.ReactNode; className?: string}) { return <label className={`grid min-w-0 gap-2 text-sm font-medium ${className}`.trim()}>{label}{children}{error}</label>; }
function TrashIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></svg>; }
