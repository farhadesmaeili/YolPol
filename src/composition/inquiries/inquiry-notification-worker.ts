import type {EmailNotificationProvider, TelegramNotificationProvider} from "@/features/inquiries/application/ports/inquiry-ports";
import {ProcessInquiryNotifications} from "@/features/inquiries/application/use-cases/process-inquiry-notifications";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresInquiryOutbox} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-outbox";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";

const providerNotConfigured = async (): Promise<never> => { throw new Error("Notification provider is not configured."); };
const telegram: TelegramNotificationProvider = {sendInquiryCreated: providerNotConfigured};
const email: EmailNotificationProvider = {sendInquiryCreated: providerNotConfigured};

export function createInquiryNotificationWorker(): ProcessInquiryNotifications {
  const pool = getInquiryPostgresPool();
  return new ProcessInquiryNotifications(new PostgresInquiryOutbox(pool), new PostgresInquiryRepository(pool), telegram, email, {now: () => new Date()});
}
