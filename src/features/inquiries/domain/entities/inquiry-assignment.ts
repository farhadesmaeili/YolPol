import {InquiryAssignmentError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new InquiryAssignmentError("Assignment timestamp must be a valid date.");
  return new Date(value);
}

export class InquiryAssignment {
  private constructor(
    readonly inquiryId: InquiryId,
    private _teamMemberId: string | null,
    private _changedAt: Date | null,
  ) {}

  static unassigned(inquiryId: string): InquiryAssignment {
    return new InquiryAssignment(InquiryId.create(inquiryId), null, null);
  }

  static reconstitute(inquiryId: string, teamMemberId: string, changedAt: Date): InquiryAssignment {
    const member = TeamMember.reconstitute(teamMemberId, true);
    return new InquiryAssignment(InquiryId.create(inquiryId), member.id, validDate(changedAt));
  }

  get teamMemberId(): string | null { return this._teamMemberId; }
  get changedAt(): Date | null { return this._changedAt ? new Date(this._changedAt) : null; }

  assignTo(member: TeamMember, at: Date): boolean {
    if (!member.active) throw new InquiryAssignmentError("Inactive team members cannot be assigned.");
    const timestamp = validDate(at);
    if (this._changedAt && timestamp <= this._changedAt) throw new InquiryAssignmentError("Assignment timestamp must move forwards.");
    if (this._teamMemberId === member.id) return false;
    this._teamMemberId = member.id;
    this._changedAt = timestamp;
    return true;
  }

  unassign(at: Date): boolean {
    const timestamp = validDate(at);
    if (this._changedAt && timestamp <= this._changedAt) throw new InquiryAssignmentError("Assignment timestamp must move forwards.");
    if (this._teamMemberId === null) return false;
    this._teamMemberId = null;
    this._changedAt = timestamp;
    return true;
  }
}
