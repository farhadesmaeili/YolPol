import {submitInquiryUnits, type SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {normalizeInquiryCustomerDetails, normalizeInquiryQuantity, normalizeInternationalPhone} from "@/features/inquiries/domain/validation/inquiry-input-validation";
import {normalizeInquiryProductId} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";
import type {InquiryDraftFailure, InquiryDraftLine, InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";
import type {Locale} from "@/shared/types/locale";

export type InquiryDraftFields = Readonly<{fullName: string; company: string; country: string; city: string; email: string; phone: string; whatsappPhone: string; telegramUsername: string; preferredMethods: readonly ("email" | "whatsapp" | "telegram")[]; destinationCountry: string; destinationCity: string; message: string; privacyAccepted: boolean}>;
export type InquiryDraftMapping = Readonly<{status: "valid"; input: SubmitInquiryInput}> | Readonly<{status: "invalid"; failure: InquiryDraftFailure}>;
export const inquiryPresentationConsentVersion = "inquiry-contact-consent-v2";

function failure(field: InquiryDraftFailure["field"], code: InquiryDraftFailure["code"] = "invalid", line?: Readonly<{index: number; productId: string}>): InquiryDraftMapping {
  return Object.freeze({status: "invalid", failure: Object.freeze({field, code, ...(line ? {itemIndex: line.index, productId: line.productId} : {})})});
}

export function parseInquiryQuantity(rawValue: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(rawValue)) return null;
  const quantity = Number.parseInt(rawValue, 10);
  try { return normalizeInquiryQuantity(quantity); } catch { return null; }
}

export const parseInquiryPalletCount = parseInquiryQuantity;

export function normalizeInquiryPhoneDraft(value: string, field: "contact.phone" | "contact.whatsappPhone"): string {
  if (value.trim() === "") return value;
  try { return normalizeInternationalPhone(value, field); } catch { return value; }
}

export function preselectInquiryProducts(products: readonly InquiryProductOption[], requestedIds: readonly string[]): InquiryDraftLine[] {
  if (requestedIds.length !== 1) return [];
  const requestedId = requestedIds[0];
  return requestedId === requestedId.trim() && products.some(({id}) => id === requestedId) ? [{productId: requestedId, quantityText: "", unit: "pallets"}] : [];
}

export function preselectInquiryProduct(products: readonly InquiryProductOption[], requestedId: string | null): InquiryDraftLine[] { return preselectInquiryProducts(products, requestedId === null ? [] : [requestedId]); }

const domainFieldMap: Readonly<Record<string, InquiryDraftFailure["field"]>> = Object.freeze({"contact.fullName": "fullName", "contact.company": "company", "contact.email": "email", "contact.phone": "phone", "contact.whatsappPhone": "whatsappPhone", "contact.telegramUsername": "telegramUsername", "contact.preferredMethods": "preferredContact", "location.country": "country", "location.city": "city", "destination.country": "destinationCountry", "destination.city": "destinationCity", message: "message"});

export function mapInquiryDraft(fields: InquiryDraftFields, lines: readonly InquiryDraftLine[], locale: Locale): InquiryDraftMapping {
  let details: Pick<SubmitInquiryInput, "contact" | "location" | "destination" | "message">;
  try {
    details = normalizeInquiryCustomerDetails({contact: {fullName: fields.fullName, company: fields.company, email: fields.email, phone: fields.phone, whatsappPhone: fields.preferredMethods.includes("whatsapp") ? fields.whatsappPhone : undefined, telegramUsername: fields.preferredMethods.includes("telegram") ? fields.telegramUsername : undefined, preferredMethods: fields.preferredMethods}, location: {country: fields.country, city: fields.city}, destination: {country: fields.destinationCountry, city: fields.destinationCity}, message: fields.message});
  } catch (error) {
    if (!(error instanceof InquiryValidationError)) throw error;
    const field = domainFieldMap[error.field] ?? "products";
    const code = error.field === "destination.country" && fields.destinationCity.trim() !== "" && fields.destinationCountry.trim() === "" ? "destinationDependency" : error.field === "contact.preferredMethods" ? "required" : "invalid";
    return failure(field, code);
  }
  if (!fields.privacyAccepted) return failure("privacy", "required");
  if (lines.length === 0 || new Set(lines.map(({productId}) => productId)).size !== lines.length) return failure("products", "required");
  const items: SubmitInquiryInput["items"][number][] = [];
  for (const [index, line] of lines.entries()) {
    const lineIdentity = {index, productId: line.productId};
    try { normalizeInquiryProductId(line.productId); } catch { return failure("products", "invalid", lineIdentity); }
    if (!submitInquiryUnits.includes(line.unit)) return failure("quantityUnit", "invalid", lineIdentity);
    if (line.unit === "packages" && locale !== "fa") return failure("quantityUnit", "invalid", lineIdentity);
    if (line.quantityText === "") return failure("quantity", "required", lineIdentity);
    const quantity = parseInquiryQuantity(line.quantityText);
    if (quantity === null) return failure("quantity", /^[1-9][0-9]*$/u.test(line.quantityText) ? "tooLarge" : "invalid", lineIdentity);
    items.push(Object.freeze({productId: line.productId, quantity, unit: line.unit}));
  }
  return Object.freeze({status: "valid", input: Object.freeze({contact: details.contact, location: details.location, destination: details.destination, message: details.message, privacy: Object.freeze({accepted: true, policyVersion: inquiryPresentationConsentVersion}), source: Object.freeze({locale, path: `/${locale}/inquiry`}), items: Object.freeze(items)})});
}
