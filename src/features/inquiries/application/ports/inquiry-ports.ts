import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Conversation} from "@/features/inquiries/domain/entities/conversation";
import type {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";
import type {CustomerConversationMessageCreated} from "@/features/inquiries/domain/events/customer-conversation-message-created";
import type {InquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import type {Locale} from "@/shared/types/locale";

export class DuplicateInquiryIdError extends Error { readonly name = "DuplicateInquiryIdError"; }
export interface InquiryRepository { save(inquiry: Inquiry, event?: InquiryCreated, conversation?: Conversation, access?: ConversationAccessCredential): Promise<void>; findById(id: string): Promise<Inquiry | null>; }
export interface InquiryIdGenerator { generate(): string; }
export interface Clock { now(): Date; }
export type CatalogProduct = Readonly<{id: string; sku: string; slug: string; status: "draft" | "published" | "archived"; localizedNames: Readonly<Partial<Record<Locale, string>>>; packaging?: Readonly<{unitsPerPackage: number; packagesPerPallet: number; unitsPerPallet: number; grossPalletWeightGrams: number}>}>;
export interface InquiryProductCatalog { findById(id: string): Promise<CatalogProduct | null>; }
export type NotificationChannel = "email" | "telegram";
export type InquiryNotificationEvent = InquiryCreated | CustomerConversationMessageCreated;
export type PendingInquiryEvent = Readonly<{event: InquiryNotificationEvent; attempts: number}>;
export interface InquiryOutbox {
  claimPending(limit: number, now: Date): Promise<readonly PendingInquiryEvent[]>;
  markProcessed(eventId: string, processedAt: Date): Promise<void>;
  scheduleRetry(eventId: string, nextAttemptAt: Date): Promise<void>;
}
export interface TelegramNotificationProvider { sendInquiryCreated(eventId: string, inquiry: Inquiry): Promise<void>; }
export interface EmailNotificationProvider { sendInquiryCreated(eventId: string, inquiry: Inquiry): Promise<void>; }
