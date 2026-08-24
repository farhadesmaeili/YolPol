import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Locale} from "@/shared/types/locale";

export class DuplicateInquiryIdError extends Error { readonly name = "DuplicateInquiryIdError"; }
export interface InquiryRepository { save(inquiry: Inquiry): Promise<void>; findById(id: string): Promise<Inquiry | null>; }
export interface InquiryIdGenerator { generate(): string; }
export interface Clock { now(): Date; }
export type CatalogProduct = Readonly<{id: string; sku: string; slug: string; status: "draft" | "published" | "archived"; localizedNames: Readonly<Partial<Record<Locale, string>>>; packaging?: Readonly<{unitsPerPallet: number; grossPalletWeightGrams: number}>}>;
export interface InquiryProductCatalog { findById(id: string): Promise<CatalogProduct | null>; }
export type NotificationChannel = "email" | "telegram";
export type NotificationResult = Readonly<{status: "requested" | "failed"}>;
export interface InquiryNotificationDispatcher { dispatch(inquiry: Inquiry, channel: NotificationChannel): Promise<NotificationResult>; }
