import type {Locale} from "@/shared/types/locale";
import type {InquiryUnit, PreferredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";

export type SubmitInquiryItemInput = Readonly<{productId: string; quantity: number; unit: InquiryUnit}>;
export type SubmitInquiryInput = Readonly<{contact: Readonly<{fullName: string; company?: string; email: string; phone: string; telegramUsername?: string; preferredMethod: PreferredContactMethod}>; location: Readonly<{country: string; city?: string}>; destination?: Readonly<{country?: string; city?: string}>; message?: string; privacy: Readonly<{accepted: boolean; policyVersion: string}>; source: Readonly<{locale: Locale; path: string}>; items: readonly SubmitInquiryItemInput[]}>;
export type AcceptedInquiryDto = Readonly<{inquiryId: string; status: "received"; createdAt: string}>;
