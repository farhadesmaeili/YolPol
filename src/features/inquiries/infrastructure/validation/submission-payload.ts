import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {contactMethods} from "@/features/inquiries/domain/types/inquiry-types";
import {isLocale} from "@/i18n/locale";

export type SubmissionPayloadIssue = Readonly<{field: string; code: "invalid_type" | "missing" | "unexpected" | "invalid_value"}>;
export type SubmissionPayloadParseResult = Readonly<{status: "success"; value: SubmitInquiryInput}> | Readonly<{status: "failure"; issues: readonly SubmissionPayloadIssue[]}>;
type RecordValue = Record<string, unknown>;
const plainRecord = (value: unknown): value is RecordValue => { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; };
const own = (record: RecordValue, key: string): unknown => Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
const keysAllowed = (record: RecordValue, allowed: readonly string[], field: string, issues: SubmissionPayloadIssue[]) => { if (Object.keys(record).some((key) => !allowed.includes(key))) issues.push({field: field || "request", code: "unexpected"}); };
const requiredString = (record: RecordValue, key: string, field: string, issues: SubmissionPayloadIssue[]): string => { const value = own(record, key); if (value === undefined) { issues.push({field, code: "missing"}); return ""; } if (typeof value !== "string") { issues.push({field, code: "invalid_type"}); return ""; } return value; };
const optionalString = (record: RecordValue, key: string, field: string, issues: SubmissionPayloadIssue[]): string | undefined => { const value = own(record, key); if (value === undefined) return undefined; if (typeof value !== "string") { issues.push({field, code: "invalid_type"}); return undefined; } return value; };
const section = (root: RecordValue, key: string, issues: SubmissionPayloadIssue[]): RecordValue => { const value = own(root, key); if (value === undefined) { issues.push({field: key, code: "missing"}); return {}; } if (!plainRecord(value)) { issues.push({field: key, code: "invalid_type"}); return {}; } return value; };

/** Rejects unexpected keys and reconstructs a fresh, prototype-safe primitive input. */
export function parseSubmissionPayload(value: unknown): SubmissionPayloadParseResult {
  if (!plainRecord(value)) return {status: "failure", issues: Object.freeze([{field: "request", code: "invalid_type"}])};
  const issues: SubmissionPayloadIssue[] = [];
  keysAllowed(value, ["contact", "location", "destination", "message", "privacy", "source", "items"], "", issues);
  const contact = section(value, "contact", issues); const location = section(value, "location", issues); const privacy = section(value, "privacy", issues); const source = section(value, "source", issues);
  keysAllowed(contact, ["fullName", "company", "email", "phone", "whatsappPhone", "telegramUsername", "preferredMethods"], "contact", issues); keysAllowed(location, ["country", "city"], "location", issues); keysAllowed(privacy, ["accepted", "policyVersion"], "privacy", issues); keysAllowed(source, ["locale", "path"], "source", issues);
  const methodsValue = own(contact, "preferredMethods"); let preferredMethods: SubmitInquiryInput["contact"]["preferredMethods"] = [];
  if (methodsValue === undefined) issues.push({field: "contact.preferredMethods", code: "missing"});
  else if (!Array.isArray(methodsValue)) issues.push({field: "contact.preferredMethods", code: "invalid_type"});
  else if (methodsValue.length === 0 || methodsValue.some((method) => typeof method !== "string" || !contactMethods.includes(method as never)) || new Set(methodsValue).size !== methodsValue.length) issues.push({field: "contact.preferredMethods", code: "invalid_value"});
  else preferredMethods = contactMethods.filter((method) => methodsValue.includes(method));
  const accepted = own(privacy, "accepted"); if (accepted === undefined) issues.push({field: "privacy.accepted", code: "missing"}); else if (typeof accepted !== "boolean") issues.push({field: "privacy.accepted", code: "invalid_type"});
  const locale = own(source, "locale"); if (locale === undefined) issues.push({field: "source.locale", code: "missing"}); else if (typeof locale !== "string" || !isLocale(locale)) issues.push({field: "source.locale", code: "invalid_value"});
  const destinationValue = own(value, "destination"); let destination: {country?: string; city?: string} | undefined;
  if (destinationValue !== undefined) { if (!plainRecord(destinationValue)) issues.push({field: "destination", code: "invalid_type"}); else { keysAllowed(destinationValue, ["country", "city"], "destination", issues); destination = {country: optionalString(destinationValue, "country", "destination.country", issues), city: optionalString(destinationValue, "city", "destination.city", issues)}; } }
  const message = optionalString(value, "message", "message", issues); const itemValues = own(value, "items"); const items: SubmitInquiryInput["items"][number][] = [];
  if (itemValues === undefined) issues.push({field: "items", code: "missing"}); else if (!Array.isArray(itemValues)) issues.push({field: "items", code: "invalid_type"}); else itemValues.forEach((candidate, index) => {
    const field = `items.${index}`; if (!plainRecord(candidate)) { issues.push({field, code: "invalid_type"}); return; } keysAllowed(candidate, ["productId", "palletCount"], field, issues);
    const productId = requiredString(candidate, "productId", `${field}.productId`, issues); const palletCount = own(candidate, "palletCount");
    if (palletCount === undefined) issues.push({field: `${field}.palletCount`, code: "missing"}); else if (typeof palletCount !== "number" || !Number.isFinite(palletCount)) issues.push({field: `${field}.palletCount`, code: "invalid_type"});
    if (typeof palletCount === "number" && Number.isFinite(palletCount)) items.push({productId, palletCount});
  });
  const result: SubmitInquiryInput = {contact: {fullName: requiredString(contact, "fullName", "contact.fullName", issues), company: optionalString(contact, "company", "contact.company", issues), email: requiredString(contact, "email", "contact.email", issues), phone: requiredString(contact, "phone", "contact.phone", issues), whatsappPhone: optionalString(contact, "whatsappPhone", "contact.whatsappPhone", issues), telegramUsername: optionalString(contact, "telegramUsername", "contact.telegramUsername", issues), preferredMethods}, location: {country: requiredString(location, "country", "location.country", issues), city: optionalString(location, "city", "location.city", issues)}, destination, message, privacy: {accepted: accepted as boolean, policyVersion: requiredString(privacy, "policyVersion", "privacy.policyVersion", issues)}, source: {locale: locale as SubmitInquiryInput["source"]["locale"], path: requiredString(source, "path", "source.path", issues)}, items};
  return issues.length ? {status: "failure", issues: Object.freeze(issues.map((issue) => Object.freeze(issue)))} : {status: "success", value: result};
}
