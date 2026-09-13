import type {ListTeamInquiriesInput} from "@/features/inquiries/application/dto/team-operations-dto";
import {inquiryStatuses, type InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";

export const unassignedFilterValue = "__unassigned";
const supportedParameters = new Set(["assignment", "cursor", "status"]);

export type StaffInquiryFilterState = Readonly<{
  assignment: string;
  cursor?: string;
  input: ListTeamInquiriesInput;
  invalid: boolean;
  status: "" | InquiryStatus;
}>;

function single(value: string | readonly string[] | undefined): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return value.length === 1 ? value[0] : null;
}

export function parseStaffInquiryFilters(
  values: Readonly<Record<string, string | readonly string[] | undefined>>,
  assignableTeamMemberIds: ReadonlySet<string>,
): StaffInquiryFilterState {
  let invalid = Object.keys(values).some((key) => !supportedParameters.has(key));
  const rawStatus = single(values.status);
  const rawAssignment = single(values.assignment);
  const rawCursor = single(values.cursor);

  const status = rawStatus && inquiryStatuses.includes(rawStatus as InquiryStatus)
    ? rawStatus as InquiryStatus
    : "";
  if (rawStatus === null || (rawStatus !== undefined && rawStatus !== "" && status === "")) invalid = true;

  const assignment = rawAssignment === unassignedFilterValue || (rawAssignment && assignableTeamMemberIds.has(rawAssignment))
    ? rawAssignment
    : "";
  if (rawAssignment === null || (rawAssignment !== undefined && rawAssignment !== "" && assignment === "")) invalid = true;

  const cursor = typeof rawCursor === "string" && rawCursor.length >= 1 && rawCursor.length <= 512
    ? rawCursor
    : undefined;
  if (rawCursor === null || (rawCursor !== undefined && cursor === undefined)) invalid = true;

  return Object.freeze({
    status,
    assignment,
    cursor,
    invalid,
    input: Object.freeze({
      ...(status ? {status} : {}),
      ...(cursor ? {cursor} : {}),
      ...(assignment === unassignedFilterValue
        ? {assignment: {type: "unassigned" as const}}
        : assignment
          ? {assignment: {type: "assigned" as const, teamMemberId: assignment}}
          : {}),
    }),
  });
}

export function serializeStaffInquiryFilters(
  filters: Pick<StaffInquiryFilterState, "assignment" | "status">,
  cursor?: string | null,
): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.assignment) params.set("assignment", filters.assignment);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/staff/inquiries?${query}` : "/staff/inquiries";
}
