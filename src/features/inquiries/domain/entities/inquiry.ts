import {InquiryTransitionError, InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {inquiryStatuses, type InquiryCreateInput, type InquiryItemInput, type InquiryReconstitutionInput, type InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import {normalizeInquiryCustomerDetails, normalizeInquiryQuantity, normalizeInquiryText, normalizeInquiryUnit} from "@/features/inquiries/domain/validation/inquiry-input-validation";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {createInquiryProductSnapshot} from "@/features/inquiries/domain/value-objects/inquiry-product-snapshot";
import {supportedLocales} from "@/shared/types/locale";

const transitions: Readonly<Record<InquiryStatus, readonly InquiryStatus[]>> = Object.freeze({received: ["processing", "spam"], processing: ["contacted", "spam"], contacted: ["quoted", "lost", "spam"], quoted: ["won", "lost", "spam"], won: [], lost: [], spam: []});
const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze({...value});
const date = (value: unknown, field: string): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new InquiryValidationError(field, `${field} must be a valid date.`);
  return new Date(value);
};
function item(input: InquiryItemInput): Readonly<InquiryItemInput> {
  return freeze({...createInquiryProductSnapshot(input), quantity: normalizeInquiryQuantity(input.quantity), unit: normalizeInquiryUnit(input.unit)});
}

export class Inquiry {
  private constructor(readonly id: InquiryId, private readonly _contact: Readonly<InquiryCreateInput["contact"]>, private readonly _location: Readonly<InquiryCreateInput["location"]>, private readonly _destination: Readonly<InquiryCreateInput["destination"]> | undefined, readonly message: string | undefined, private readonly _privacy: Readonly<Omit<InquiryCreateInput["privacy"], "acceptedAt"> & {acceptedAt: Date}>, private readonly _source: Readonly<InquiryCreateInput["source"]>, private readonly _items: readonly Readonly<InquiryItemInput>[], private _status: InquiryStatus, private readonly _createdAt: Date, private _updatedAt: Date) {}

  static create(input: InquiryCreateInput): Inquiry { return Inquiry.build({...input, status: "received", updatedAt: input.createdAt}, false); }
  static reconstitute(input: InquiryReconstitutionInput): Inquiry { return Inquiry.build(input, true); }
  private static build(input: InquiryReconstitutionInput, allowLegacy: boolean): Inquiry {
    const id = InquiryId.create(input.id);
    if (!inquiryStatuses.includes(input.status)) throw new InquiryValidationError("status", "Unsupported status.");
    const createdAt = date(input.createdAt, "createdAt"); const updatedAt = date(input.updatedAt, "updatedAt");
    if (updatedAt < createdAt) throw new InquiryValidationError("updatedAt", "Updated timestamp cannot precede creation.");
    if (input.privacy.accepted !== true) throw new InquiryValidationError("privacy.accepted", "Privacy consent is required.");
    const acceptedAt = date(input.privacy.acceptedAt, "privacy.acceptedAt");
    if (acceptedAt > createdAt) throw new InquiryValidationError("privacy.acceptedAt", "Consent cannot follow creation.");
    const details = allowLegacy ? normalizeInquiryCustomerDetails(input, {allowLegacy: true}) : normalizeInquiryCustomerDetails(input);
    if (!supportedLocales.includes(input.source.locale)) throw new InquiryValidationError("source.locale", "Unsupported locale.");
    if (typeof input.source.path !== "string") throw new InquiryValidationError("source.path", "Source must be a safe localized internal path.");
    const segments = input.source.path.split("/");
    const localizedPath = new RegExp(`^/${input.source.locale}(?:/|(?:/[A-Za-z0-9._~-]+)*/?)$`);
    if (!localizedPath.test(input.source.path) || segments.some((segment) => segment === "." || segment === "..")) throw new InquiryValidationError("source.path", "Source must be a safe localized internal path.");
    if (!Array.isArray(input.items) || input.items.length === 0) throw new InquiryValidationError("items", "At least one item is required.");
    const items = Object.freeze(input.items.map(item));
    if (new Set(items.map(({productId}) => productId)).size !== items.length) throw new InquiryValidationError("items.productId", "Duplicate Products are not allowed.");
    if (!allowLegacy) {
      if (items.some(({unit}) => unit !== "pallets")) throw new InquiryValidationError("items.unit", "New Inquiries require pallet quantities.");
    }
    return new Inquiry(id, freeze(details.contact), freeze(details.location), details.destination ? freeze(details.destination) : undefined, details.message, Object.freeze({accepted: true, acceptedAt, policyVersion: normalizeInquiryText(input.privacy.policyVersion, "privacy.policyVersion", 1, 100)!}), freeze({locale: input.source.locale, path: input.source.path}), items, input.status, createdAt, updatedAt);
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
