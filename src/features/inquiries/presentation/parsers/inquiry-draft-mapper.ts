import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {normalizeInquiryCustomerDetails, normalizeInquiryQuantity, normalizeInquiryUnit} from "@/features/inquiries/domain/validation/inquiry-input-validation";
import {normalizeInquiryProductId} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";
import type {InquiryDraftFailure, InquiryDraftLine, InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";
import type {Locale} from "@/shared/types/locale";

export type InquiryDraftFields = Readonly<{fullName: string; company: string; country: string; city: string; email: string; phone: string; preferredMethod: string; destinationCountry: string; destinationCity: string; message: string; privacyAccepted: boolean}>;
export type InquiryDraftMapping = Readonly<{status: "valid"; input: SubmitInquiryInput}> | Readonly<{status: "invalid"; failure: InquiryDraftFailure}>;
export const inquiryPresentationConsentVersion = "inquiry-contact-consent-v1";

function failure(field: InquiryDraftFailure["field"], code: InquiryDraftFailure["code"] = "invalid", line?: Readonly<{index: number; productId: string}>): InquiryDraftMapping {
  return Object.freeze({status: "invalid", failure: Object.freeze({field, code, ...(line ? {itemIndex: line.index, productId: line.productId} : {})})});
}

export function parseInquiryQuantity(rawValue: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(rawValue)) return null;
  const quantity = Number.parseInt(rawValue, 10);
  try { return normalizeInquiryQuantity(quantity); } catch { return null; }
}

export function preselectInquiryProducts(products: readonly InquiryProductOption[], requestedIds: readonly string[]): InquiryDraftLine[] {
  if (requestedIds.length !== 1) return [];
  const requestedId = requestedIds[0];
  return requestedId === requestedId.trim() && products.some(({id}) => id === requestedId) ? [{productId: requestedId, quantityText: "", unit: ""}] : [];
}

export function preselectInquiryProduct(products: readonly InquiryProductOption[], requestedId: string | null): InquiryDraftLine[] {
  return preselectInquiryProducts(products, requestedId === null ? [] : [requestedId]);
}

const domainFieldMap: Readonly<Record<string, InquiryDraftFailure["field"]>> = Object.freeze({
  "contact.fullName": "fullName", "contact.company": "company", "contact.email": "email", "contact.phone": "phone", "contact.telegramUsername": "preferredContact", "contact.preferredMethod": "preferredContact",
  "location.country": "country", "location.city": "city", "destination.country": "destinationCountry", "destination.city": "destinationCity", message: "message",
});

export function mapInquiryDraft(fields: InquiryDraftFields, lines: readonly InquiryDraftLine[], locale: Locale): InquiryDraftMapping {
  let details: ReturnType<typeof normalizeInquiryCustomerDetails>;
  try {
    details = normalizeInquiryCustomerDetails({
      contact: {fullName: fields.fullName, company: fields.company, email: fields.email, phone: fields.phone, preferredMethod: fields.preferredMethod},
      location: {country: fields.country, city: fields.city},
      destination: {country: fields.destinationCountry, city: fields.destinationCity}, message: fields.message,
    });
  } catch (error) {
    if (!(error instanceof InquiryValidationError)) throw error;
    const field = domainFieldMap[error.field] ?? "products";
    const code = error.field === "destination.country" && fields.destinationCity.trim() !== "" && fields.destinationCountry.trim() === "" ? "destinationDependency" : "invalid";
    return failure(field, code);
  }
  if (!fields.privacyAccepted) return failure("privacy", "required");
  if (lines.length === 0 || new Set(lines.map(({productId}) => productId)).size !== lines.length) return failure("products", "required");
  const items = [];
  for (const [index, line] of lines.entries()) {
    const lineIdentity = {index, productId: line.productId};
    try { normalizeInquiryProductId(line.productId); } catch { return failure("products", "invalid", lineIdentity); }
    if (line.quantityText === "") return failure("quantity", "required", lineIdentity);
    const quantity = parseInquiryQuantity(line.quantityText);
    if (quantity === null) return failure("quantity", /^[1-9][0-9]*$/u.test(line.quantityText) ? "tooLarge" : "invalid", lineIdentity);
    if (line.unit === "") return failure("unit", "required", lineIdentity);
    let unit;
    try { unit = normalizeInquiryUnit(line.unit); } catch { return failure("unit", "invalid", lineIdentity); }
    items.push(Object.freeze({productId: line.productId, quantity, unit}));
  }
  return Object.freeze({status: "valid", input: Object.freeze({contact: details.contact, location: details.location, destination: details.destination, message: details.message, privacy: Object.freeze({accepted: true, policyVersion: inquiryPresentationConsentVersion}), source: Object.freeze({locale, path: `/${locale}/inquiry`}), items: Object.freeze(items)})});
}
