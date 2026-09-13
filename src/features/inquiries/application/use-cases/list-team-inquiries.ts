import type {ListTeamInquiriesInput, TeamInquiryAssignmentFilter, TeamInquiryListItemDto} from "@/features/inquiries/application/dto/team-operations-dto";
import type {TeamInquiryCursor, TeamOperationsReadRepository} from "@/features/inquiries/application/ports/team-operations-read-port";
import type {ListTeamInquiriesResult} from "@/features/inquiries/application/results/team-operations-results";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";
import {inquiryStatuses} from "@/features/inquiries/domain/types/inquiry-types";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export const defaultTeamInquiryPageSize = 25;
export const maximumTeamInquiryPageSize = 100;
const cursorSeparator = "~";
const maximumCursorLength = 512;

function decodeCursor(value: string): TeamInquiryCursor | null {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumCursorLength) return null;
  const parts = value.split(cursorSeparator);
  if (parts.length !== 2) return null;
  try {
    const createdAtValue = decodeURIComponent(parts[0]!);
    const inquiryIdValue = decodeURIComponent(parts[1]!);
    const createdAt = new Date(createdAtValue);
    const inquiryId = InquiryId.create(inquiryIdValue).value;
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== createdAtValue) return null;
    return Object.freeze({createdAt, inquiryId});
  } catch { return null; }
}

function encodeCursor(item: TeamInquiryListItemDto): string {
  return `${encodeURIComponent(item.createdAt)}${cursorSeparator}${encodeURIComponent(item.id)}`;
}

function validAssignment(input: unknown): input is TeamInquiryAssignmentFilter | undefined {
  if (input === undefined) return true;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  if (record.type === "unassigned") return Object.keys(record).length === 1;
  if (record.type !== "assigned" || Object.keys(record).length !== 2 || typeof record.teamMemberId !== "string") return false;
  try { TeamMember.reconstitute(record.teamMemberId, true); return true; }
  catch { return false; }
}

export class ListTeamInquiries {
  constructor(private readonly reader: TeamOperationsReadRepository) {}

  async execute(input: ListTeamInquiriesInput = {}): Promise<ListTeamInquiriesResult> {
    const pageSize = input.pageSize ?? defaultTeamInquiryPageSize;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maximumTeamInquiryPageSize) {
      return {status: "validation_failed", field: "pageSize"};
    }
    if (input.status !== undefined && !inquiryStatuses.includes(input.status)) {
      return {status: "validation_failed", field: "status"};
    }
    if (!validAssignment(input.assignment)) return {status: "validation_failed", field: "assignment"};
    const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
    if (input.cursor !== undefined && cursor === null) return {status: "validation_failed", field: "cursor"};

    try {
      const rows = await this.reader.listInquiries({
        limit: pageSize + 1,
        cursor,
        ...(input.status === undefined ? {} : {status: input.status}),
        ...(input.assignment === undefined ? {} : {assignment: input.assignment}),
      });
      const hasNextPage = rows.length > pageSize;
      const inquiries = Object.freeze(rows.slice(0, pageSize));
      const last = inquiries.at(-1);
      return Object.freeze({
        status: "found",
        inquiries,
        nextCursor: hasNextPage && last ? encodeCursor(last) : null,
      });
    } catch { return {status: "persistence_failed"}; }
  }
}
