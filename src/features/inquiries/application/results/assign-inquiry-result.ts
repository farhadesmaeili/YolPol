export type AssignInquiryResult =
  | Readonly<{status: "assigned"; teamMemberId: string}>
  | Readonly<{status: "unassigned"}>
  | Readonly<{status: "unchanged"; teamMemberId: string | null}>
  | Readonly<{status: "inquiry_not_found" | "team_member_not_found" | "team_member_inactive" | "validation_failed" | "conflict" | "persistence_failed"}>;
