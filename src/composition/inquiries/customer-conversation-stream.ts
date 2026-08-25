import "server-only";

import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {StreamConversationUpdates} from "@/features/inquiries/application/use-cases/stream-conversation-updates";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {InMemoryConversationUpdateStreamRegistry} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-update-stream-registry";
import {TimerConversationPollingDelay} from "@/features/inquiries/infrastructure/streaming/timer-conversation-polling-delay";

const streams = new InMemoryConversationUpdateStreamRegistry();
let streamer: StreamConversationUpdates | undefined;

export function getCustomerConversationStreamer(): StreamConversationUpdates {
  streamer ??= new StreamConversationUpdates(
    new ReadNewConversationMessages(new PostgresConversationMessageRepository(getInquiryPostgresPool())),
    streams,
    new TimerConversationPollingDelay(),
  );
  return streamer;
}
