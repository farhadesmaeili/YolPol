import "server-only";

import {ReceiveTelegramReply} from "@/features/inquiries/application/use-cases/receive-telegram-reply";
import {readTelegramWebhookConfig} from "@/features/inquiries/infrastructure/config/telegram-config";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresCommunicationRecipientRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-communication-recipient-repository";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresTelegramDeliveryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-telegram-delivery-repository";

let gateway: ReceiveTelegramReply | undefined;

export function getTelegramReplyGateway(): ReceiveTelegramReply {
  if (gateway) return gateway;
  const pool = getInquiryPostgresPool();
  gateway = new ReceiveTelegramReply(
    new PostgresCommunicationRecipientRepository(pool),
    new PostgresTelegramDeliveryRepository(pool),
    new PostgresConversationMessageRepository(pool),
    {now: () => new Date()},
  );
  return gateway;
}

export function getTelegramWebhookSecret(): string {
  return readTelegramWebhookConfig().webhookSecret;
}
