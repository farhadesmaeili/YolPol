import type {ConversationMessageUpdate, ConversationPollingDelay, ConversationUpdateListener, ConversationUpdateStreamRegistry} from "@/features/inquiries/application/ports/conversation-stream-ports";
import type {StreamConversationUpdatesResult} from "@/features/inquiries/application/results/stream-conversation-updates-result";
import type {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {conversationMessageReadBatchLimit} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {ConversationId} from "@/features/inquiries/domain/value-objects/conversation-id";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export const conversationUpdatePollingIntervalMs = 1_500;

export class StreamConversationUpdates {
  constructor(
    private readonly readNewMessages: Pick<ReadNewConversationMessages, "execute">,
    private readonly streams: ConversationUpdateStreamRegistry,
    private readonly delay: ConversationPollingDelay,
  ) {}

  open(input: Readonly<{
    conversationId: string;
    inquiryId: string;
    afterCursor: number;
    signal: AbortSignal;
    onUpdate: ConversationUpdateListener;
    onUnavailable: () => void;
  }>): StreamConversationUpdatesResult {
    let conversationId: string;
    let inquiryId: string;
    try {
      conversationId = ConversationId.create(input.conversationId).value;
      inquiryId = InquiryId.create(input.inquiryId).value;
    } catch (error) {
      if (error instanceof ConversationValidationError || error instanceof InquiryValidationError) return {status: "validation_failed"};
      throw error;
    }
    if (!Number.isSafeInteger(input.afterCursor) || input.afterCursor < -1) return {status: "validation_failed"};

    const registration = this.streams.register({conversationId, afterCursor: input.afterCursor, listener: input.onUpdate});
    if (!registration) return {status: "capacity_exceeded"};

    const controller = new AbortController();
    const close = () => controller.abort();
    if (input.signal.aborted) close();
    else input.signal.addEventListener("abort", close, {once: true});

    const completed = this.poll({inquiryId, afterCursor: input.afterCursor, signal: controller.signal, publish: (updates) => registration.publish(updates)})
      .catch(() => {
        if (!controller.signal.aborted) {
          try { input.onUnavailable(); } catch { /* Stream consumers own their delivery boundary. */ }
        }
      })
      .finally(() => {
        input.signal.removeEventListener("abort", close);
        registration.close();
      });

    return Object.freeze({status: "opened", session: Object.freeze({close, completed})});
  }

  private async poll(input: Readonly<{
    inquiryId: string;
    afterCursor: number;
    signal: AbortSignal;
    publish: (updates: readonly ConversationMessageUpdate[]) => void;
  }>): Promise<void> {
    let afterCursor = input.afterCursor;
    while (!input.signal.aborted) {
      const result = await this.readNewMessages.execute({inquiryId: input.inquiryId, afterCursor, limit: conversationMessageReadBatchLimit});
      if (result.status !== "found") throw new Error("Conversation updates are unavailable.");
      if (result.updates.length > 0) {
        input.publish(result.updates);
        afterCursor = result.updates[result.updates.length - 1]!.cursor;
      }
      await this.delay.wait(conversationUpdatePollingIntervalMs, input.signal);
    }
  }
}
