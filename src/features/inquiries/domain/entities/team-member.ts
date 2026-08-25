import {InquiryAssignmentError} from "@/features/inquiries/domain/errors/inquiry-errors";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;

export class TeamMember {
  private constructor(readonly id: string, readonly active: boolean) {}

  static reconstitute(id: string, active: boolean): TeamMember {
    if (typeof id !== "string" || !referencePattern.test(id)) throw new InquiryAssignmentError("Invalid team member reference.");
    if (typeof active !== "boolean") throw new InquiryAssignmentError("Invalid team member state.");
    return new TeamMember(id, active);
  }
}
