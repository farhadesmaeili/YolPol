import type {ConversationChannelBinding} from "@/features/conversation-channels/domain/entities/conversation-channel-binding";
import type {ConversationChannelBindingIdentity, ConversationChannelBindingSnapshot, ConversationChannelFailureCategory, ConversationChannelSendTextResult, ClaimedConversationChannelDelivery, NormalizedInboundChannelText} from "@/features/conversation-channels/domain/types/conversation-channel-types";

export interface ConversationChannelClock { now(): Date; }
export interface ConversationChannelIdGenerator { generate(): string; }
export interface ConversationChannelLeaseTokenGenerator { generate(): string; }

export type SaveConversationChannelBindingResult =
  | Readonly<{status: "created"; binding: ConversationChannelBindingSnapshot}>
  | Readonly<{status: "duplicate"; binding: ConversationChannelBindingSnapshot}>
  | Readonly<{status: "conflict"}>
  | Readonly<{status: "conversation_not_found"}>;

export interface ConversationChannelBindingRepository {
  save(binding: ConversationChannelBinding): Promise<SaveConversationChannelBindingResult>;
  findByIdentity(identity: ConversationChannelBindingIdentity): Promise<ConversationChannelBindingSnapshot | null>;
}

export type RecordInboundChannelTextResult =
  | Readonly<{status: "recorded" | "duplicate"; inboundMessageId: string; bindingId: string; conversationId: string; correlatedMessageId: string | null}>
  | Readonly<{status: "conflict"}>;

export interface ConversationChannelInboundRepository {
  record(input: Readonly<{
    id: string;
    binding: ConversationChannelBindingSnapshot;
    message: NormalizedInboundChannelText;
    receivedAt: Date;
  }>): Promise<RecordInboundChannelTextResult>;
}

export type ScheduleConversationChannelDeliveryResult =
  | Readonly<{status: "scheduled" | "duplicate"; deliveryId: string}>
  | Readonly<{status: "message_not_found" | "binding_not_found" | "binding_mismatch" | "not_customer_visible" | "translation_not_ready" | "conflict"}>;

export interface ConversationChannelDeliveryRepository {
  schedule(input: Readonly<{id: string; messageId: string; bindingId: string; now: Date}>): Promise<ScheduleConversationChannelDeliveryResult>;
  claimDue(input: Readonly<{limit: number; now: Date; leaseMilliseconds: number}>): Promise<readonly ClaimedConversationChannelDelivery[]>;
  // Confirms current ownership and Customer-safe eligibility immediately before dispatch.
  isLeaseCurrent(input: Readonly<{job: ClaimedConversationChannelDelivery; now: Date}>): Promise<boolean>;
  markDelivered(input: Readonly<{job: ClaimedConversationChannelDelivery; providerMessageReference: string; now: Date}>): Promise<boolean>;
  markRetryable(input: Readonly<{job: ClaimedConversationChannelDelivery; category: ConversationChannelFailureCategory; availableAt: Date; now: Date}>): Promise<"rescheduled" | "failed" | "stale_lease">;
  markFailed(input: Readonly<{job: ClaimedConversationChannelDelivery; category: ConversationChannelFailureCategory; now: Date}>): Promise<boolean>;
  markUnknown(input: Readonly<{job: ClaimedConversationChannelDelivery; now: Date}>): Promise<boolean>;
}

export interface ConversationChannelOutboundAdapter {
  // RETRYABLE_FAILURE and PERMANENT_FAILURE must confirm that no message was
  // accepted. A timeout/throw after possible acceptance must return UNKNOWN.
  // Adapters must send literal text with provider markup parsing disabled.
  sendText(input: ConversationChannelBindingIdentity & Readonly<{
    text: string;
    idempotencyReference: string;
  }>): Promise<ConversationChannelSendTextResult>;
}
