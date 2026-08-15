import type {Locale} from "@/shared/types/locale";

export const inquiryStatuses = ["received", "processing", "contacted", "quoted", "won", "lost", "spam"] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];
export const inquiryUnits = ["pieces", "packages", "pallets", "truckloads"] as const;
export type InquiryUnit = (typeof inquiryUnits)[number];
export const contactMethods = ["email", "whatsapp", "telegram", "phone"] as const;
export type PreferredContactMethod = (typeof contactMethods)[number];

export type InquiryItemInput = Readonly<{productId: string; sku: string; slug: string; productName: string; quantity: number; unit: InquiryUnit}>;
export type InquiryContactInput = Readonly<{fullName: string; company?: string; email: string; phone: string; telegramUsername?: string; preferredMethod: PreferredContactMethod}>;
export type InquiryLocationInput = Readonly<{country: string; city?: string}>;
export type InquiryDestinationInput = Readonly<{country?: string; city?: string}>;
export type InquiryPrivacyInput = Readonly<{accepted: boolean; acceptedAt: Date; policyVersion: string}>;
export type InquirySourceInput = Readonly<{locale: Locale; path: string}>;

export type InquiryCreateInput = Readonly<{id: string; contact: InquiryContactInput; location: InquiryLocationInput; destination?: InquiryDestinationInput; message?: string; privacy: InquiryPrivacyInput; source: InquirySourceInput; items: readonly InquiryItemInput[]; createdAt: Date}>;
export type InquiryReconstitutionInput = Omit<InquiryCreateInput, "createdAt"> & Readonly<{status: InquiryStatus; createdAt: Date; updatedAt: Date}>;
