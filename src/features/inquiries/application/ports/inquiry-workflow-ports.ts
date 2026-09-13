import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {InquiryAssignment} from "@/features/inquiries/domain/entities/inquiry-assignment";
import type {TeamMember} from "@/features/inquiries/domain/entities/team-member";
import type {InquiryWorkflowEvent, StoredInquiryWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";

export type WorkflowWriteResult = "changed" | "conflict" | "member_inactive";
export type InquiryStatusSnapshot = Readonly<{status: InquiryStatus; updatedAt: Date}>;
export type InquiryAssignmentSnapshot = Readonly<{teamMemberId: string | null; changedAt: Date | null}>;

export interface InquiryWorkflowHistoryReader {
  readHistory(inquiryId: string): Promise<readonly StoredInquiryWorkflowEvent[]>;
}

export interface InquiryWorkflowRepository extends InquiryWorkflowHistoryReader {
  findAssignment(inquiryId: string): Promise<InquiryAssignment>;
  findTeamMember(id: string): Promise<TeamMember | null>;
  changeStatus(inquiry: Inquiry, expected: InquiryStatusSnapshot, event: InquiryWorkflowEvent): Promise<WorkflowWriteResult>;
  changeAssignment(assignment: InquiryAssignment, expected: InquiryAssignmentSnapshot, event: InquiryWorkflowEvent): Promise<WorkflowWriteResult>;
}
