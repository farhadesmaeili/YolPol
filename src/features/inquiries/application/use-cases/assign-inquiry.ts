import type {AssignInquiryInput} from "@/features/inquiries/application/dto/inquiry-workflow-dto";
import type {Clock, InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import type {InquiryWorkflowRepository} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import type {AssignInquiryResult} from "@/features/inquiries/application/results/assign-inquiry-result";
import {InquiryAssignmentError, InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {createAssignmentWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";

export class AssignInquiry {
  constructor(
    private readonly inquiries: InquiryRepository,
    private readonly workflow: InquiryWorkflowRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: AssignInquiryInput): Promise<AssignInquiryResult> {
    let inquiryId: string;
    try {
      inquiryId = InquiryId.create(input.inquiryId).value;
      if (input.teamMemberId !== null) TeamMember.reconstitute(input.teamMemberId, true);
    } catch { return {status: "validation_failed"}; }

    try {
      if (!await this.inquiries.findById(inquiryId)) return {status: "inquiry_not_found"};
      const assignment = await this.workflow.findAssignment(inquiryId);
      const previousTeamMemberId = assignment.teamMemberId;
      const previousChangedAt = assignment.changedAt;
      if (previousTeamMemberId === input.teamMemberId) return {status: "unchanged", teamMemberId: previousTeamMemberId};

      if (input.teamMemberId === null) {
        const occurredAt = this.clock.now();
        assignment.unassign(occurredAt);
        const event = createAssignmentWorkflowEvent(inquiryId, previousTeamMemberId, assignment.teamMemberId, input.actorReference, occurredAt);
        const result = await this.workflow.changeAssignment(assignment, {teamMemberId: previousTeamMemberId, changedAt: previousChangedAt}, event);
        if (result === "conflict") return {status: "conflict"};
        if (result === "member_inactive") return {status: "team_member_inactive"};
      } else {
        const member = await this.workflow.findTeamMember(input.teamMemberId);
        if (!member) return {status: "team_member_not_found"};
        if (!member.active) return {status: "team_member_inactive"};
        const occurredAt = this.clock.now();
        assignment.assignTo(member, occurredAt);
        const event = createAssignmentWorkflowEvent(inquiryId, previousTeamMemberId, assignment.teamMemberId, input.actorReference, occurredAt);
        const result = await this.workflow.changeAssignment(assignment, {teamMemberId: previousTeamMemberId, changedAt: previousChangedAt}, event);
        if (result === "conflict") return {status: "conflict"};
        if (result === "member_inactive") return {status: "team_member_inactive"};
      }
      return assignment.teamMemberId === null ? {status: "unassigned"} : {status: "assigned", teamMemberId: assignment.teamMemberId};
    } catch (error) {
      if (error instanceof InquiryAssignmentError || error instanceof InquiryValidationError) return {status: "validation_failed"};
      return {status: "persistence_failed"};
    }
  }
}
