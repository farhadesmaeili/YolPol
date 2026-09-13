import "server-only";

import {getInquiryRepository} from "@/composition/inquiries/inquiry-persistence";
import {SendStaffConversationReply} from "@/features/inquiries/application/use-cases/send-staff-conversation-reply";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {NodeStaffReplyMessageIdFactory} from "@/features/inquiries/infrastructure/security/staff-reply-message-id-factory";

let staffConversationReply: SendStaffConversationReply | undefined;

export function getStaffConversationReply(): SendStaffConversationReply {
  staffConversationReply ??= new SendStaffConversationReply(
    getInquiryRepository(),
    new PostgresConversationMessageRepository(getInquiryPostgresPool()),
    new NodeStaffReplyMessageIdFactory(),
    {now: () => new Date()},
  );
  return staffConversationReply;
}
