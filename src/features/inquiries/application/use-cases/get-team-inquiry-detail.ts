import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import type {ConversationMessageReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {InquiryWorkflowHistoryReader} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import type {TeamOperationsReadRepository} from "@/features/inquiries/application/ports/team-operations-read-port";
import type {GetTeamInquiryDetailResult} from "@/features/inquiries/application/results/team-operations-results";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export class GetTeamInquiryDetail {
  constructor(
    private readonly reader: TeamOperationsReadRepository,
    private readonly workflowHistory: InquiryWorkflowHistoryReader,
    private readonly conversationMessages: ConversationMessageReader,
  ) {}

  async execute(input: Readonly<{inquiryId: string}>): Promise<GetTeamInquiryDetailResult> {
    let inquiryId: string;
    try { inquiryId = InquiryId.create(input.inquiryId).value; }
    catch { return {status: "validation_failed"}; }

    try {
      const snapshot = await this.reader.findInquiryDetail(inquiryId);
      if (!snapshot) return {status: "inquiry_not_found"};
      const [workflowHistory, conversationMessages] = await Promise.all([
        this.workflowHistory.readHistory(inquiryId),
        this.conversationMessages.findForInquiry(inquiryId),
      ]);
      return Object.freeze({
        status: "found",
        detail: Object.freeze({
          inquiry: snapshot.inquiry,
          assignment: snapshot.assignment,
          workflowHistory: Object.freeze([...workflowHistory]),
          conversationMessages: Object.freeze((conversationMessages ?? []).map(toConversationMessageDto)),
        }),
      });
    } catch { return {status: "persistence_failed"}; }
  }
}
