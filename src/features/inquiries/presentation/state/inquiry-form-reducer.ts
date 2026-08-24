import type {PreferredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";
import type {InquiryDraftFields} from "@/features/inquiries/presentation/parsers/inquiry-draft-mapper";
import type {InquiryDraftFailure, InquiryDraftLine} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";

export type InquiryFormFeedback = "idle" | "invalid" | "submitting" | "succeeded" | "failed";
export type InquirySubmissionFailureKind = "service" | "timeout" | "rate_limited";
export type InquiryFormState = Readonly<{fields: InquiryDraftFields; lines: readonly InquiryDraftLine[]; pendingProductId: string; feedback: InquiryFormFeedback; inquiryId: string | null; failure: InquiryDraftFailure | null; submissionFailure: InquirySubmissionFailureKind | null; preselectionResolved: boolean}>;
export type InquiryTextField = Exclude<keyof InquiryDraftFields, "privacyAccepted">;

export type InquiryFormAction =
  | Readonly<{type: "update_field"; field: InquiryTextField; value: string}>
  | Readonly<{type: "update_consent"; value: boolean}>
  | Readonly<{type: "toggle_contact_method"; method: PreferredContactMethod; selected: boolean}>
  | Readonly<{type: "select_pending_product"; productId: string}>
  | Readonly<{type: "add_product"; availableIds: readonly string[]}>
  | Readonly<{type: "remove_product"; productId: string}>
  | Readonly<{type: "change_product"; index: number; productId: string}>
  | Readonly<{type: "change_pallet_count"; index: number; value: string}>
  | Readonly<{type: "apply_preselection"; lines: readonly InquiryDraftLine[]}>
  | Readonly<{type: "validation_failed"; failure: InquiryDraftFailure}>
  | Readonly<{type: "submission_started"}>
  | Readonly<{type: "submission_succeeded"; inquiryId: string}>
  | Readonly<{type: "submission_failed"; failure?: InquiryDraftFailure; kind?: InquirySubmissionFailureKind}>
  | Readonly<{type: "reset"}>;

export function createInitialInquiryFormState(preselectionResolved = false): InquiryFormState {
  return Object.freeze({fields: Object.freeze({fullName: "", company: "", country: "", city: "", email: "", phone: "", whatsappPhone: "", telegramUsername: "", preferredMethods: Object.freeze([]), destinationCountry: "", destinationCity: "", message: "", privacyAccepted: false}), lines: Object.freeze([]), pendingProductId: "", feedback: "idle", inquiryId: null, failure: null, submissionFailure: null, preselectionResolved});
}

const edited = (state: InquiryFormState, change: Partial<InquiryFormState>): InquiryFormState => Object.freeze({...state, ...change, feedback: "idle", inquiryId: null, failure: null, submissionFailure: null});
const updateLine = (state: InquiryFormState, index: number, change: Partial<InquiryDraftLine>): InquiryFormState => edited(state, {lines: Object.freeze(state.lines.map((line, lineIndex) => lineIndex === index ? Object.freeze({...line, ...change}) : line))});

export function inquiryFormReducer(state: InquiryFormState, action: InquiryFormAction): InquiryFormState {
  switch (action.type) {
    case "update_field": return edited(state, {fields: Object.freeze({...state.fields, [action.field]: action.value})});
    case "update_consent": return edited(state, {fields: Object.freeze({...state.fields, privacyAccepted: action.value})});
    case "toggle_contact_method": {
      const methods = action.selected ? [...state.fields.preferredMethods, action.method] : state.fields.preferredMethods.filter((method) => method !== action.method);
      const canonical = (["email", "whatsapp", "telegram"] as const).filter((method) => methods.includes(method));
      return edited(state, {fields: Object.freeze({...state.fields, preferredMethods: Object.freeze(canonical)})});
    }
    case "select_pending_product": return edited(state, {pendingProductId: action.productId});
    case "add_product": {
      const productId = state.pendingProductId;
      if (!productId || !action.availableIds.includes(productId) || state.lines.some((line) => line.productId === productId)) return state;
      return edited(state, {lines: Object.freeze([...state.lines, Object.freeze({productId, palletCountText: ""})]), pendingProductId: ""});
    }
    case "remove_product": return edited(state, {lines: Object.freeze(state.lines.filter((line) => line.productId !== action.productId)), pendingProductId: ""});
    case "change_product": return updateLine(state, action.index, {productId: action.productId});
    case "change_pallet_count": return updateLine(state, action.index, {palletCountText: action.value});
    case "apply_preselection": return edited(state, {lines: Object.freeze(action.lines.map((line) => Object.freeze({...line}))), pendingProductId: "", preselectionResolved: true});
    case "validation_failed": return Object.freeze({...state, feedback: "invalid", inquiryId:null, failure: action.failure, submissionFailure:null});
    case "submission_started": return state.feedback === "submitting" ? state : Object.freeze({...state, feedback: "submitting", inquiryId:null, failure: null, submissionFailure:null});
    case "submission_succeeded": return Object.freeze({...state, feedback: "succeeded", inquiryId:action.inquiryId, failure: null, submissionFailure:null});
    case "submission_failed": return Object.freeze({...state, feedback: "failed", inquiryId:null, failure: action.failure ?? null, submissionFailure:action.kind ?? "service"});
    case "reset": return createInitialInquiryFormState(true);
  }
}

export function inquiryControlId(field: InquiryDraftFailure["field"], itemIndex?: number): string { return `inquiry-${field}${itemIndex === undefined ? "" : `-${itemIndex}`}`; }
export function inquiryErrorId(field: InquiryDraftFailure["field"], itemIndex?: number): string { return `${inquiryControlId(field, itemIndex)}-error`; }
export function inquiryFailureFocusId(failure: InquiryDraftFailure): string { return inquiryControlId(failure.field, failure.itemIndex); }
export function inquiryAddedProductFocusId(index: number): string { return inquiryControlId("palletCount", index); }
