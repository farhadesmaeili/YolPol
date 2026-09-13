import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";

export type SendStaffConversationReplyInput = Readonly<{
  inquiryId: string;
  body: string;
  clientMessageId: string;
  actorReference: string;
}>;

export type StaffConversationReplyDto = StaffConversationMessageDto;
