import "server-only";

import {ReceiveTelegramReply} from "@/features/inquiries/application/use-cases/receive-telegram-reply";
import {readTelegramOutboundConfig, readTelegramWebhookConfig} from "@/features/inquiries/infrastructure/config/telegram-config";
import {TelegramCommunicationAdapter} from "@/features/inquiries/infrastructure/communication/telegram/telegram-communication-adapter";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {createTelegramWebhookHandler} from "@/features/inquiries/infrastructure/http/telegram-webhook-handler";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresTelegramDeliveryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-telegram-delivery-repository";
import {getTelegramStaffOnboarding} from "@/composition/telegram-staff-onboarding/telegram-staff-onboarding";
import {TelegramStaffConnectionCommandHandler} from "@/features/telegram-staff-onboarding/infrastructure/communication/telegram/telegram-staff-connection-command-handler";

let gateway: ReceiveTelegramReply | undefined;
let startGateway: TelegramStaffConnectionCommandHandler | undefined;

export function getTelegramReplyGateway(): ReceiveTelegramReply {
  if (gateway) return gateway;
  const pool = getInquiryPostgresPool();
  gateway = new ReceiveTelegramReply(
    getTelegramStaffOnboarding().resolveStaffActor,
    new PostgresTelegramDeliveryRepository(pool),
    new PostgresConversationMessageRepository(pool),
    {now: () => new Date()},
  );
  return gateway;
}

export function getTelegramStartGateway(): TelegramStaffConnectionCommandHandler {
  if (startGateway) return startGateway;
  const adapter = new TelegramCommunicationAdapter(readTelegramOutboundConfig().botToken);
  startGateway = new TelegramStaffConnectionCommandHandler(
    getTelegramStaffOnboarding().consumeConnectionRequest,
    {async send({chatId, text}) {
      const result = await adapter.sendMessage({recipientExternalId: chatId, message: {text}});
      if (result.status !== "delivered") throw new Error("Telegram onboarding response was not confirmed delivered.");
    }},
  );
  return startGateway;
}

export function getTelegramWebhookSecret(): string {
  return readTelegramWebhookConfig().webhookSecret;
}

export const handleTelegramWebhook = createTelegramWebhookHandler(
  getTelegramReplyGateway,
  getTelegramStartGateway,
  getTelegramWebhookSecret,
);
