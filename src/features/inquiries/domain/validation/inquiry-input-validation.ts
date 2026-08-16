import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {contactMethods, inquiryUnits, type InquiryContactInput, type InquiryDestinationInput, type InquiryLocationInput, type InquiryUnit, type PreferredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";

const unsafeSingleLine = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const unsafeMultiline = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

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

export function normalizeInquiryCustomerDetails(input: Readonly<{
  contact: Readonly<{fullName: unknown; company?: unknown; email: unknown; phone: unknown; telegramUsername?: unknown; preferredMethod: unknown}>;
  location: Readonly<{country: unknown; city?: unknown}>;
  destination?: Readonly<{country?: unknown; city?: unknown}>;
  message?: unknown;
}>): Readonly<{contact: InquiryContactInput; location: InquiryLocationInput; destination?: InquiryDestinationInput; message?: string}> {
  const preferredMethod = input.contact.preferredMethod;
  if (!contactMethods.includes(preferredMethod as PreferredContactMethod)) throw new InquiryValidationError("contact.preferredMethod", "Unsupported contact method.");
  const telegramUsername = normalizeInquiryText(input.contact.telegramUsername, "contact.telegramUsername", 5, 32, true);
  if (telegramUsername && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramUsername.replace(/^@/, ""))) throw new InquiryValidationError("contact.telegramUsername", "Invalid Telegram username.");
  if (preferredMethod === "telegram" && !telegramUsername) throw new InquiryValidationError("contact.telegramUsername", "Telegram username is required.");
  const email = normalizeInquiryText(input.contact.email, "contact.email", 3, 254)!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InquiryValidationError("contact.email", "Invalid email.");
  const phone = normalizeInquiryText(input.contact.phone, "contact.phone", 7, 40)!;
  if (!/^\+?[0-9][0-9 ()-]{5,38}[0-9]$/.test(phone)) throw new InquiryValidationError("contact.phone", "Invalid international phone.");
  const country = normalizeInquiryText(input.location.country, "location.country", 2, 100)!;
  const city = normalizeInquiryText(input.location.city, "location.city", 2, 100, true);
  const destinationCountry = normalizeInquiryText(input.destination?.country, "destination.country", 2, 100, true);
  const destinationCity = normalizeInquiryText(input.destination?.city, "destination.city", 2, 100, true);
  if (destinationCity && !destinationCountry) throw new InquiryValidationError("destination.country", "Destination country is required with a city.");
  const message = normalizeInquiryMessage(input.message);
  return Object.freeze({
    contact: Object.freeze({fullName: normalizeInquiryText(input.contact.fullName, "contact.fullName", 2, 120)!, company: normalizeInquiryText(input.contact.company, "contact.company", 2, 160, true), email, phone, telegramUsername: telegramUsername?.replace(/^@/, ""), preferredMethod: preferredMethod as PreferredContactMethod}),
    location: Object.freeze({country, city}),
    destination: destinationCountry || destinationCity ? Object.freeze({country: destinationCountry, city: destinationCity}) : undefined,
    message,
  });
}

export function normalizeInquiryQuantity(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000_000) throw new InquiryValidationError("items.quantity", "Quantity must be a safe integer from 1 to 1,000,000,000.");
  return value as number;
}

export function normalizeInquiryUnit(value: unknown): InquiryUnit {
  if (!inquiryUnits.includes(value as InquiryUnit)) throw new InquiryValidationError("items.unit", "Unsupported requested unit.");
  return value as InquiryUnit;
}
