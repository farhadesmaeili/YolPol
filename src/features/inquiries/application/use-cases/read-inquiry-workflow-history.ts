import type {ReadInquiryWorkflowHistoryInput} from "@/features/inquiries/application/dto/inquiry-workflow-dto";
import type {InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import type {InquiryWorkflowRepository} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import type {ReadInquiryWorkflowHistoryResult} from "@/features/inquiries/application/results/read-inquiry-workflow-history-result";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export class ReadInquiryWorkflowHistory {
  constructor(private readonly inquiries: InquiryRepository, private readonly workflow: InquiryWorkflowRepository) {}

  async execute(input: ReadInquiryWorkflowHistoryInput): Promise<ReadInquiryWorkflowHistoryResult> {
    let inquiryId: string;
    try { inquiryId = InquiryId.create(input.inquiryId).value; }
    catch { return {status: "validation_failed"}; }

    try {
      if (!await this.inquiries.findById(inquiryId)) return {status: "inquiry_not_found"};
      return {status: "found", events: await this.workflow.readHistory(inquiryId)};
    } catch { return {status: "persistence_failed"}; }
  }
}
