import type {Pool, PoolConfig} from "pg";

import {formatCustomerConversationMessageCreatedNotification, formatInquiryCreatedNotification} from "@/features/inquiries/application/formatters/inquiry-notification-formatter";
import {ProcessInquiryNotifications} from "@/features/inquiries/application/use-cases/process-inquiry-notifications";
import {TelegramCommunicationAdapter} from "@/features/inquiries/infrastructure/communication/telegram/telegram-communication-adapter";
import {readTelegramOutboundConfig, type TelegramOutboundConfig} from "@/features/inquiries/infrastructure/config/telegram-config";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {readPostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresInquiryOutbox} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-outbox";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";
import {PostgresTelegramDeliveryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-telegram-delivery-repository";
import {runtimeApplicationOrigin} from "@/shared/config/deployment-environment";

export type InquiryNotificationWorkerRuntime = Readonly<{
  worker: Pick<ProcessInquiryNotifications, "execute">;
  close(): Promise<void>;
}>;

export type InquiryNotificationWorkerStartupDependencies = Readonly<{
  readPostgresConfiguration(): PoolConfig;
  readTelegramConfiguration(): TelegramOutboundConfig;
  readApplicationOrigin(): string;
  createPool(config: PoolConfig): Pool;
}>;

const defaultStartupDependencies: InquiryNotificationWorkerStartupDependencies = Object.freeze({
  readPostgresConfiguration: readPostgresConfig,
  readTelegramConfiguration: readTelegramOutboundConfig,
  readApplicationOrigin: runtimeApplicationOrigin,
  createPool: createPostgresPool,
});

export function createStaffInquiryUrl(applicationOrigin: string, inquiryId: string): string {
  return new URL(`/en/staff/inquiries/${encodeURIComponent(inquiryId)}`, applicationOrigin).toString();
}

export function createInquiryNotificationWorker(
  dependencies: InquiryNotificationWorkerStartupDependencies = defaultStartupDependencies,
): InquiryNotificationWorkerRuntime {
  const postgresConfig = dependencies.readPostgresConfiguration();
  const telegramConfig = dependencies.readTelegramConfiguration();
  const applicationOrigin = dependencies.readApplicationOrigin();
  const pool = dependencies.createPool(postgresConfig);
  const telegram = new TelegramCommunicationAdapter(telegramConfig.botToken);
  const conversations = new PostgresConversationMessageRepository(pool);
  const staffInquiryUrl = (inquiryId: string) => createStaffInquiryUrl(applicationOrigin, inquiryId);
  const worker = new ProcessInquiryNotifications(
    new PostgresInquiryOutbox(pool),
    new PostgresInquiryRepository(pool),
    conversations,
    new PostgresTelegramDeliveryRepository(pool),
    telegram,
    {
      formatInquiryCreated: (inquiry) => formatInquiryCreatedNotification(inquiry, staffInquiryUrl(inquiry.id.value)),
      formatCustomerConversationMessageCreated: (inquiry, conversationId, message) => formatCustomerConversationMessageCreatedNotification(
        inquiry,
        conversationId,
        message,
        staffInquiryUrl(inquiry.id.value),
      ),
    },
    {now: () => new Date()},
  );
  return Object.freeze({worker, close: () => pool.end()});
}
