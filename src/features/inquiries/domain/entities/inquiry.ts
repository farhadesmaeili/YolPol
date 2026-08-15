import {InquiryTransitionError, InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {contactMethods, inquiryStatuses, inquiryUnits, type InquiryCreateInput, type InquiryItemInput, type InquiryReconstitutionInput, type InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {createInquiryProductSnapshot} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";
import {supportedLocales} from "@/shared/types/locale";

const transitions: Readonly<Record<InquiryStatus, readonly InquiryStatus[]>> = Object.freeze({received: ["processing", "spam"], processing: ["contacted", "spam"], contacted: ["quoted", "lost", "spam"], quoted: ["won", "lost", "spam"], won: [], lost: [], spam: []});
const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze({...value});
const unsafeSingleLine = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const unsafeMultiline = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const text = (value: unknown, field: string, min: number, max: number, optional = false): string | undefined => {
  if (optional && (value === undefined || value === null || value === "")) return undefined;
  if (typeof value !== "string") throw new InquiryValidationError(field, `${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new InquiryValidationError(field, `${field} must be ${min}-${max} characters.`);
  if (unsafeSingleLine.test(normalized)) throw new InquiryValidationError(field, `${field} must be single-line text without control characters.`);
  return normalized;
};
const messageText = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new InquiryValidationError("message", "message must be text.");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < 1 || normalized.length > 2000) throw new InquiryValidationError("message", "message must be 1-2000 characters.");
  if (unsafeMultiline.test(normalized)) throw new InquiryValidationError("message", "message contains unsupported control characters.");
  return normalized;
};
const date = (value: unknown, field: string): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new InquiryValidationError(field, `${field} must be a valid date.`);
  return new Date(value);
};
function item(input: InquiryItemInput): Readonly<InquiryItemInput> {
  if (!inquiryUnits.includes(input.unit)) throw new InquiryValidationError("items.unit", "Unsupported requested unit.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1_000_000_000) throw new InquiryValidationError("items.quantity", "Quantity must be an integer from 1 to 1,000,000,000.");
  return freeze({...createInquiryProductSnapshot(input), quantity: input.quantity, unit: input.unit});
}

export class Inquiry {
  private constructor(readonly id: InquiryId, private readonly _contact: Readonly<InquiryCreateInput["contact"]>, private readonly _location: Readonly<InquiryCreateInput["location"]>, private readonly _destination: Readonly<InquiryCreateInput["destination"]> | undefined, readonly message: string | undefined, private readonly _privacy: Readonly<Omit<InquiryCreateInput["privacy"], "acceptedAt"> & {acceptedAt: Date}>, private readonly _source: Readonly<InquiryCreateInput["source"]>, private readonly _items: readonly Readonly<InquiryItemInput>[], private _status: InquiryStatus, private readonly _createdAt: Date, private _updatedAt: Date) {}

  static create(input: InquiryCreateInput): Inquiry { return Inquiry.build({...input, status: "received", updatedAt: input.createdAt}); }
  static reconstitute(input: InquiryReconstitutionInput): Inquiry { return Inquiry.build(input); }
  private static build(input: InquiryReconstitutionInput): Inquiry {
    const id = InquiryId.create(input.id);
    if (!inquiryStatuses.includes(input.status)) throw new InquiryValidationError("status", "Unsupported status.");
    const createdAt = date(input.createdAt, "createdAt"); const updatedAt = date(input.updatedAt, "updatedAt");
    if (updatedAt < createdAt) throw new InquiryValidationError("updatedAt", "Updated timestamp cannot precede creation.");
    if (input.privacy.accepted !== true) throw new InquiryValidationError("privacy.accepted", "Privacy consent is required.");
    const acceptedAt = date(input.privacy.acceptedAt, "privacy.acceptedAt");
    if (acceptedAt > createdAt) throw new InquiryValidationError("privacy.acceptedAt", "Consent cannot follow creation.");
    const preferredMethod = input.contact.preferredMethod;
    if (!contactMethods.includes(preferredMethod)) throw new InquiryValidationError("contact.preferredMethod", "Unsupported contact method.");
    const telegramUsername = text(input.contact.telegramUsername, "contact.telegramUsername", 5, 32, true);
    if (telegramUsername && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramUsername.replace(/^@/, ""))) throw new InquiryValidationError("contact.telegramUsername", "Invalid Telegram username.");
    if (preferredMethod === "telegram" && !telegramUsername) throw new InquiryValidationError("contact.telegramUsername", "Telegram username is required.");
    const email = text(input.contact.email, "contact.email", 3, 254)!.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InquiryValidationError("contact.email", "Invalid email.");
    const phone = text(input.contact.phone, "contact.phone", 7, 40)!;
    if (!/^\+?[0-9][0-9 ()-]{5,38}[0-9]$/.test(phone)) throw new InquiryValidationError("contact.phone", "Invalid international phone.");
    const country = text(input.location.country, "location.country", 2, 100)!; const city = text(input.location.city, "location.city", 2, 100, true);
    const destinationCountry = text(input.destination?.country, "destination.country", 2, 100, true); const destinationCity = text(input.destination?.city, "destination.city", 2, 100, true);
    if (destinationCity && !destinationCountry) throw new InquiryValidationError("destination.country", "Destination country is required with a city.");
    const message = messageText(input.message);
    if (!supportedLocales.includes(input.source.locale)) throw new InquiryValidationError("source.locale", "Unsupported locale.");
    if (typeof input.source.path !== "string") throw new InquiryValidationError("source.path", "Source must be a safe localized internal path.");
    const segments = input.source.path.split("/");
    const localizedPath = new RegExp(`^/${input.source.locale}(?:/|(?:/[A-Za-z0-9._~-]+)*/?)$`);
    if (!localizedPath.test(input.source.path) || segments.some((segment) => segment === "." || segment === "..")) throw new InquiryValidationError("source.path", "Source must be a safe localized internal path.");
    if (!Array.isArray(input.items) || input.items.length === 0) throw new InquiryValidationError("items", "At least one item is required.");
    const items = Object.freeze(input.items.map(item));
    if (new Set(items.map(({productId}) => productId)).size !== items.length) throw new InquiryValidationError("items.productId", "Duplicate Products are not allowed.");
    return new Inquiry(id, freeze({fullName: text(input.contact.fullName, "contact.fullName", 2, 120)!, company: text(input.contact.company, "contact.company", 2, 160, true), email, phone, telegramUsername: telegramUsername?.replace(/^@/, ""), preferredMethod}), freeze({country, city}), destinationCountry || destinationCity ? freeze({country: destinationCountry, city: destinationCity}) : undefined, message, Object.freeze({accepted: true, acceptedAt, policyVersion: text(input.privacy.policyVersion, "privacy.policyVersion", 1, 100)!}), freeze({locale: input.source.locale, path: input.source.path}), items, input.status, createdAt, updatedAt);
  }
  get contact() { return freeze(this._contact); } get location() { return freeze(this._location); } get destination() { return this._destination ? freeze(this._destination) : undefined; }
  get privacy() { return Object.freeze({...this._privacy, acceptedAt: new Date(this._privacy.acceptedAt)}); } get source() { return freeze(this._source); }
  get items() { return Object.freeze(this._items.map((entry) => freeze(entry))); } get status() { return this._status; }
  get createdAt() { return new Date(this._createdAt); } get updatedAt() { return new Date(this._updatedAt); }
  transitionTo(status: InquiryStatus, at: Date): void {
    if (!inquiryStatuses.includes(status)) throw new InquiryTransitionError("Unsupported target status.");
    if (status === this._status) return;
    const timestamp = date(at, "transitionAt");
    if (timestamp < this._updatedAt) throw new InquiryTransitionError("Transition timestamp cannot move backwards.");
    if (!transitions[this._status].includes(status)) throw new InquiryTransitionError(`Cannot transition from ${this._status} to ${status}.`);
    this._status = status; this._updatedAt = timestamp;
  }
}
