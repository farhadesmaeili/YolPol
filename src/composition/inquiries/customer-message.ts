import "server-only";

import {randomUUID} from "node:crypto";

import {ReceiveCustomerMessage} from "@/features/inquiries/application/use-cases/receive-customer-message";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";

let receiver: ReceiveCustomerMessage | undefined;

export function getCustomerMessageReceiver(): ReceiveCustomerMessage {
  receiver ??= new ReceiveCustomerMessage(
    new PostgresConversationMessageRepository(getInquiryPostgresPool()),
    {generate: () => randomUUID()},
    {now: () => new Date()},
  );
  return receiver;
}
