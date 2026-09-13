import type {Locale} from "@/shared/types/locale";
import type {PreferredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";

export const submitInquiryUnits = ["pallets", "packages"] as const;
export type SubmitInquiryUnit = (typeof submitInquiryUnits)[number];
export type SubmitInquiryItemInput =
  | Readonly<{productId: string; quantity: number; unit: SubmitInquiryUnit}>
  | Readonly<{productId: string; palletCount: number}>;
export type SubmitInquiryInput = Readonly<{contact: Readonly<{fullName: string; company?: string; email: string; phone: string; whatsappPhone?: string; telegramUsername?: string; preferredMethods: readonly PreferredContactMethod[]}>; location: Readonly<{country: string; city?: string}>; destination?: Readonly<{country?: string; city?: string}>; message?: string; privacy: Readonly<{accepted: boolean; policyVersion: string}>; source: Readonly<{locale: Locale; path: string}>; items: readonly SubmitInquiryItemInput[]}>;
export type AcceptedInquiryDto = Readonly<{inquiryId: string; status: "received"; createdAt: string}>;
