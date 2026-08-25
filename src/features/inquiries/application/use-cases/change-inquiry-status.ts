import type {ChangeInquiryStatusInput} from "@/features/inquiries/application/dto/inquiry-workflow-dto";
import type {Clock, InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import type {InquiryWorkflowRepository} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import type {ChangeInquiryStatusResult} from "@/features/inquiries/application/results/change-inquiry-status-result";
import {InquiryAssignmentError, InquiryTransitionError, InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {createStatusChangedWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export class ChangeInquiryStatus {
  constructor(
    private readonly inquiries: InquiryRepository,
    private readonly workflow: InquiryWorkflowRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangeInquiryStatusInput): Promise<ChangeInquiryStatusResult> {
    let inquiryId: string;
    try { inquiryId = InquiryId.create(input.inquiryId).value; }
    catch { return {status: "validation_failed"}; }

    let inquiry;
    try { inquiry = await this.inquiries.findById(inquiryId); }
    catch { return {status: "persistence_failed"}; }
    if (!inquiry) return {status: "inquiry_not_found"};
    if (inquiry.status === input.status) return {status: "unchanged", inquiryStatus: inquiry.status};

    const previousStatus = inquiry.status;
    const previousUpdatedAt = inquiry.updatedAt;
    try {
      const occurredAt = this.clock.now();
      inquiry.transitionTo(input.status, occurredAt);
      const event = createStatusChangedWorkflowEvent(inquiryId, previousStatus, inquiry.status, input.actorReference, occurredAt);
      const result = await this.workflow.changeStatus(inquiry, {status: previousStatus, updatedAt: previousUpdatedAt}, event);
      if (result !== "changed") return {status: result === "conflict" ? "conflict" : "persistence_failed"};
      return {status: "changed", inquiryStatus: inquiry.status};
    } catch (error) {
      if (error instanceof InquiryTransitionError) return {status: "invalid_transition"};
      if (error instanceof InquiryAssignmentError || error instanceof InquiryValidationError) return {status: "validation_failed"};
      return {status: "persistence_failed"};
    }
  }
}
