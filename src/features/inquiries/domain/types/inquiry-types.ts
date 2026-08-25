import type {Locale} from "@/shared/types/locale";

export const inquiryStatuses = ["NEW", "WAITING_FOR_TEAM", "WAITING_FOR_CUSTOMER", "QUOTED", "CONFIRMED", "CLOSED"] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];
export const inquiryUnits = ["pieces", "packages", "pallets", "truckloads"] as const;
export type InquiryUnit = (typeof inquiryUnits)[number];
export const contactMethods = ["email", "whatsapp", "telegram"] as const;
export type PreferredContactMethod = (typeof contactMethods)[number];
export const storedContactMethods = [...contactMethods, "phone"] as const;
export type StoredContactMethod = (typeof storedContactMethods)[number];
export const targetCountries = ["IR", "TR", "IQ", "AM", "AZ", "TM", "AF", "PK", "AE", "SA", "QA", "KW", "BH", "OM"] as const;
export type TargetCountryCode = (typeof targetCountries)[number];

export type InquiryItemInput = Readonly<{productId: string; sku: string; slug: string; productName: string; quantity: number; unit: InquiryUnit}>;
export type InquiryContactInput = Readonly<{fullName: string; company?: string; email: string; phone: string; whatsappPhone?: string; telegramUsername?: string; preferredMethods: readonly StoredContactMethod[]}>;
export type InquiryLocationInput = Readonly<{country: string; city?: string}>;
export type InquiryDestinationInput = Readonly<{country?: string; city?: string}>;
export type InquiryPrivacyInput = Readonly<{accepted: boolean; acceptedAt: Date; policyVersion: string}>;
export type InquirySourceInput = Readonly<{locale: Locale; path: string}>;

export type InquiryCreateInput = Readonly<{id: string; contact: InquiryContactInput; location: InquiryLocationInput; destination?: InquiryDestinationInput; message?: string; privacy: InquiryPrivacyInput; source: InquirySourceInput; items: readonly InquiryItemInput[]; createdAt: Date}>;
export type InquiryReconstitutionInput = Omit<InquiryCreateInput, "createdAt"> & Readonly<{status: InquiryStatus; createdAt: Date; updatedAt: Date}>;
