import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";

export type AssignInquiryInput = Readonly<{
  inquiryId: string;
  teamMemberId: string | null;
  actorReference?: string | null;
}>;

export type ChangeInquiryStatusInput = Readonly<{
  inquiryId: string;
  status: InquiryStatus;
  actorReference?: string | null;
}>;

export type ReadInquiryWorkflowHistoryInput = Readonly<{inquiryId: string}>;
