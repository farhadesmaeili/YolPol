import "server-only";

import {randomUUID} from "node:crypto";

import {GetConversationMessageHistory} from "@/features/inquiries/application/use-cases/get-conversation-message-history";
import {ReceiveCustomerMessage} from "@/features/inquiries/application/use-cases/receive-customer-message";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {getConversationAiRouting} from "@/composition/conversation-ai-routing/conversation-ai-routing";

let receiver: ReceiveCustomerMessage | undefined;
let history: GetConversationMessageHistory | undefined;
let messages: PostgresConversationMessageRepository | undefined;

function getConversationMessages(): PostgresConversationMessageRepository {
  messages ??= new PostgresConversationMessageRepository(getInquiryPostgresPool());
  return messages;
}

export function getCustomerMessageReceiver(): ReceiveCustomerMessage {
  receiver ??= new ReceiveCustomerMessage(
    getConversationMessages(),
    {generate: () => randomUUID()},
    {now: () => new Date()},
    getConversationAiRouting().scheduler,
  );
  return receiver;
}

export function getCustomerMessageHistory(): GetConversationMessageHistory {
  history ??= new GetConversationMessageHistory(getConversationMessages());
  return history;
}
