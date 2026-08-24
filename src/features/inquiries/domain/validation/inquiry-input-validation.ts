import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {contactMethods, inquiryUnits, storedContactMethods, targetCountries, type InquiryContactInput, type InquiryDestinationInput, type InquiryLocationInput, type InquiryUnit, type PreferredContactMethod, type StoredContactMethod, type TargetCountryCode} from "@/features/inquiries/domain/types/inquiry-types";

const unsafeSingleLine = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const unsafeMultiline = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const cityPattern = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

export function normalizeInquiryText(value: unknown, field: string, min: number, max: number, optional = false): string | undefined {
  if (optional && (value === undefined || value === null || value === "")) return undefined;
  if (typeof value !== "string") throw new InquiryValidationError(field, `${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new InquiryValidationError(field, `${field} must be ${min}-${max} characters.`);
  if (unsafeSingleLine.test(normalized)) throw new InquiryValidationError(field, `${field} must be single-line text without control characters.`);
  return normalized;
}

export function normalizeInquiryMessage(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new InquiryValidationError("message", "message must be text.");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < 1 || normalized.length > 2000) throw new InquiryValidationError("message", "message must be 1-2000 characters.");
  if (unsafeMultiline.test(normalized)) throw new InquiryValidationError("message", "message contains unsupported control characters.");
  return normalized;
}

export function normalizeInternationalPhone(value: unknown, field: string): string {
  const input = normalizeInquiryText(value, field, 7, 40)!;
  if (!/^\+?[1-9][0-9]*(?:[ -]?(?:[0-9]+|\([0-9]+\)))*$/u.test(input)) throw new InquiryValidationError(field, "Invalid international phone.");
  const internationalDigits = input.startsWith("+") ? input.slice(1) : input;
  const normalized = `+${internationalDigits.replace(/[ ()-]/gu, "")}`;
  if (!/^\+[1-9][0-9]{6,14}$/u.test(normalized)) throw new InquiryValidationError(field, "Invalid international phone.");
  return normalized;
}

export function normalizeInquiryEmail(value: unknown): string {
  const input = normalizeInquiryText(value, "contact.email", 3, 254)!;
  if (/\s/u.test(input)) throw new InquiryValidationError("contact.email", "Invalid email.");
  const parts = input.split("@");
  if (parts.length !== 2) throw new InquiryValidationError("contact.email", "Invalid email.");
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) throw new InquiryValidationError("contact.email", "Invalid email.");
  const labels = domain?.split(".") ?? [];
  if (labels.length < 2 || labels.some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label))) throw new InquiryValidationError("contact.email", "Invalid email.");
  return `${local}@${domain.toLowerCase()}`;
}

export function normalizeTelegramUsername(value: unknown): string {
  const input = normalizeInquiryText(value, "contact.telegramUsername", 5, 33)!;
  const username = input.startsWith("@") ? input.slice(1) : input;
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(username)) throw new InquiryValidationError("contact.telegramUsername", "Invalid Telegram username.");
  return `@${username}`;
}

export function normalizePreferredContactMethods(value: unknown, allowLegacy = false): readonly StoredContactMethod[] {
  if (!Array.isArray(value) || value.length === 0) throw new InquiryValidationError("contact.preferredMethods", "At least one preferred contact method is required.");
  const allowed = allowLegacy ? storedContactMethods : contactMethods;
  if (value.some((method) => typeof method !== "string" || !allowed.includes(method as PreferredContactMethod))) throw new InquiryValidationError("contact.preferredMethods", "Unsupported contact method.");
  if (new Set(value).size !== value.length) throw new InquiryValidationError("contact.preferredMethods", "Duplicate contact methods are not allowed.");
  return Object.freeze(allowed.filter((method) => value.includes(method)));
}

export function normalizeTargetCountry(value: unknown, field: string, optional = false): TargetCountryCode | undefined {
  if (optional && (value === undefined || value === null || value === "")) return undefined;
  if (typeof value !== "string" || !targetCountries.includes(value as TargetCountryCode)) throw new InquiryValidationError(field, "Unsupported target country.");
  return value as TargetCountryCode;
}

function normalizeCity(value: unknown, field: string): string | undefined {
  const city = normalizeInquiryText(value, field, 2, 100, true);
  if (city && !cityPattern.test(city)) throw new InquiryValidationError(field, "Invalid city.");
  return city;
}

type CustomerDetailsInput = Readonly<{contact: Readonly<{fullName: unknown; company?: unknown; email: unknown; phone: unknown; whatsappPhone?: unknown; telegramUsername?: unknown; preferredMethods: unknown}>; location: Readonly<{country: unknown; city?: unknown}>; destination?: Readonly<{country?: unknown; city?: unknown}>; message?: unknown}>;
type NormalizedCustomerDetails = Readonly<{contact: InquiryContactInput; location: InquiryLocationInput; destination?: InquiryDestinationInput; message?: string}>;
type NewCustomerDetails = Readonly<{contact: Omit<InquiryContactInput, "preferredMethods"> & Readonly<{preferredMethods: readonly PreferredContactMethod[]}>; location: InquiryLocationInput; destination?: InquiryDestinationInput; message?: string}>;

export function normalizeInquiryCustomerDetails(input: CustomerDetailsInput): NewCustomerDetails;
export function normalizeInquiryCustomerDetails(input: CustomerDetailsInput, options: Readonly<{allowLegacy: true}>): NormalizedCustomerDetails;
export function normalizeInquiryCustomerDetails(input: CustomerDetailsInput, options: Readonly<{allowLegacy?: boolean}> = {}): NormalizedCustomerDetails {
  const preferredMethods = normalizePreferredContactMethods(input.contact.preferredMethods, options.allowLegacy);
  let phone: string;
  try { phone = normalizeInternationalPhone(input.contact.phone, "contact.phone"); }
  catch (error) { if (!options.allowLegacy) throw error; phone = normalizeInquiryText(input.contact.phone, "contact.phone", 7, 40)!; }
  const whatsappSelected = preferredMethods.includes("whatsapp");
  const telegramSelected = preferredMethods.includes("telegram");
  if (!options.allowLegacy && !whatsappSelected && input.contact.whatsappPhone !== undefined) throw new InquiryValidationError("contact.whatsappPhone", "WhatsApp phone requires the WhatsApp method.");
  if (!options.allowLegacy && !telegramSelected && input.contact.telegramUsername !== undefined) throw new InquiryValidationError("contact.telegramUsername", "Telegram username requires the Telegram method.");
  let whatsappPhone: string | undefined;
  if (whatsappSelected && input.contact.whatsappPhone !== undefined) {
    try { whatsappPhone = normalizeInternationalPhone(input.contact.whatsappPhone, "contact.whatsappPhone"); }
    catch (error) { if (!options.allowLegacy) throw error; whatsappPhone = normalizeInquiryText(input.contact.whatsappPhone, "contact.whatsappPhone", 7, 40); }
  } else if (whatsappSelected && !options.allowLegacy) throw new InquiryValidationError("contact.whatsappPhone", "WhatsApp phone is required.");
  let telegramUsername: string | undefined;
  if (telegramSelected && input.contact.telegramUsername !== undefined) {
    try { telegramUsername = normalizeTelegramUsername(input.contact.telegramUsername); }
    catch (error) { if (!options.allowLegacy) throw error; telegramUsername = normalizeInquiryText(input.contact.telegramUsername, "contact.telegramUsername", 1, 33); }
  } else if (telegramSelected && !options.allowLegacy) throw new InquiryValidationError("contact.telegramUsername", "Telegram username is required.");
  let country: string;
  let destinationCountry: string | undefined;
  try { country = normalizeTargetCountry(input.location.country, "location.country")!; }
  catch (error) { if (!options.allowLegacy) throw error; country = normalizeInquiryText(input.location.country, "location.country", 2, 100)!; }
  try { destinationCountry = normalizeTargetCountry(input.destination?.country, "destination.country", true); }
  catch (error) { if (!options.allowLegacy) throw error; destinationCountry = normalizeInquiryText(input.destination?.country, "destination.country", 2, 100, true); }
  const city = normalizeCity(input.location.city, "location.city");
  const destinationCity = normalizeCity(input.destination?.city, "destination.city");
  if (destinationCity && !destinationCountry) throw new InquiryValidationError("destination.country", "Destination country is required with a city.");
  return Object.freeze({contact: Object.freeze({fullName: normalizeInquiryText(input.contact.fullName, "contact.fullName", 2, 120)!, company: normalizeInquiryText(input.contact.company, "contact.company", 2, 160, true), email: normalizeInquiryEmail(input.contact.email), phone, whatsappPhone, telegramUsername, preferredMethods}), location: Object.freeze({country, city}), destination: destinationCountry || destinationCity ? Object.freeze({country: destinationCountry, city: destinationCity}) : undefined, message: normalizeInquiryMessage(input.message)});
}

export function normalizeInquiryQuantity(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000_000) throw new InquiryValidationError("items.quantity", "Pallet count must fit the PostgreSQL Inquiry quantity constraint.");
  return value as number;
}

export function normalizeInquiryUnit(value: unknown): InquiryUnit {
  if (!inquiryUnits.includes(value as InquiryUnit)) throw new InquiryValidationError("items.unit", "Unsupported requested unit.");
  return value as InquiryUnit;
}
