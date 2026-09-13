import type {
  AssignableTeamMemberDto,
  TeamInquiryAssignmentFilter,
  TeamInquiryDetailDto,
  TeamInquiryListItemDto,
} from "@/features/inquiries/application/dto/team-operations-dto";
import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";

export type TeamInquiryCursor = Readonly<{createdAt: Date; inquiryId: string}>;

export type TeamInquiryListQuery = Readonly<{
  limit: number;
  cursor: TeamInquiryCursor | null;
  status?: InquiryStatus;
  assignment?: TeamInquiryAssignmentFilter;
}>;

export type TeamInquiryDetailSnapshot = Pick<TeamInquiryDetailDto, "inquiry" | "assignment">;

export interface TeamOperationsReadRepository {
  listInquiries(query: TeamInquiryListQuery): Promise<readonly TeamInquiryListItemDto[]>;
  findInquiryDetail(inquiryId: string): Promise<TeamInquiryDetailSnapshot | null>;
  listTeamMembers(query: Readonly<{activeOnly: true}>): Promise<readonly AssignableTeamMemberDto[]>;
}
