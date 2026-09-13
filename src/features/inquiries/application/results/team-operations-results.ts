import type {
  AssignableTeamMemberDto,
  TeamInquiryDetailDto,
  TeamInquiryListItemDto,
} from "@/features/inquiries/application/dto/team-operations-dto";

export type ListTeamInquiriesResult =
  | Readonly<{status: "found"; inquiries: readonly TeamInquiryListItemDto[]; nextCursor: string | null}>
  | Readonly<{status: "validation_failed"; field: "pageSize" | "cursor" | "status" | "assignment"}>
  | Readonly<{status: "persistence_failed"}>;

export type GetTeamInquiryDetailResult =
  | Readonly<{status: "found"; detail: TeamInquiryDetailDto}>
  | Readonly<{status: "inquiry_not_found" | "validation_failed" | "persistence_failed"}>;

export type ListAssignableTeamMembersResult =
  | Readonly<{status: "found"; teamMembers: readonly AssignableTeamMemberDto[]}>
  | Readonly<{status: "persistence_failed"}>;
