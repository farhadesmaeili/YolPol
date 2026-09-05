import "server-only";

import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";
import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {StreamConversationUpdates} from "@/features/inquiries/application/use-cases/stream-conversation-updates";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresCustomerMessageReader} from "@/features/conversation-translation/infrastructure/persistence/postgres-customer-message-reader";
import {InMemoryConversationUpdateStreamRegistry} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-update-stream-registry";
import {TimerConversationPollingDelay} from "@/features/inquiries/infrastructure/streaming/timer-conversation-polling-delay";

const streams = new InMemoryConversationUpdateStreamRegistry<ConversationMessageDto>();
let streamer: StreamConversationUpdates<ConversationMessageDto> | undefined;

export function getCustomerConversationStreamer(): StreamConversationUpdates<ConversationMessageDto> {
  streamer ??= new StreamConversationUpdates(
    new ReadNewConversationMessages(
      new PostgresCustomerMessageReader(getInquiryPostgresPool()),
      toConversationMessageDto,
    ),
    streams,
    new TimerConversationPollingDelay(),
  );
  return streamer;
}
