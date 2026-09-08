import type {InquiryUnit} from "@/features/inquiries/domain/types/inquiry-types";

export type CustomerInquirySummaryDto = Readonly<{
  createdAt: string;
  items: readonly Readonly<{productId: string; name: string; quantity: number; unit: InquiryUnit}>[];
  destination: Readonly<{country?: string; city?: string}> | null;
  details: string | null;
  initialMessageId: string | null;
}>;
