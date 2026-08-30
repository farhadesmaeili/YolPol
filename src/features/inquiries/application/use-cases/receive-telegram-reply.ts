import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import type {TelegramDeliveryRepository} from "@/features/inquiries/application/ports/communication-ports";
import type {CorrelatedConversationMessageWriter} from "@/features/inquiries/application/ports/conversation-ports";
import type {Clock} from "@/features/inquiries/application/ports/inquiry-ports";
import type {ReceiveTelegramReplyResult} from "@/features/inquiries/application/results/receive-telegram-reply-result";
import {Message} from "@/features/inquiries/domain/entities/message";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

const telegramUpdateIdPattern = /^(?:0|[1-9][0-9]{0,19})$/u;
const positiveTelegramIdPattern = /^[1-9][0-9]{0,19}$/u;
const signedTelegramIdPattern = /^-?(?:0|[1-9][0-9]{0,19})$/u;

function safeId(value: string, pattern: RegExp): number | null {
  if (!pattern.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

type TelegramStaffActorResolver = Readonly<{
  execute(input: Readonly<{telegramUserId: unknown}>): Promise<
    | Readonly<{status: "resolved"; actor: Readonly<{principal: Readonly<{actorReference: string}>; capabilities: Readonly<{mayReplyToCustomerConversation: boolean}>}>}>
    | Readonly<{status: "unresolved"}>
  >;
}>;

export class ReceiveTelegramReply {
  constructor(
    private readonly staffActors: TelegramStaffActorResolver,
    private readonly deliveries: TelegramDeliveryRepository,
    private readonly messages: CorrelatedConversationMessageWriter,
    private readonly clock: Clock,
  ) {}

  async execute(reply: ExternalChannelReply): Promise<ReceiveTelegramReplyResult> {
    if (!telegramUpdateIdPattern.test(reply.externalUpdateId)) return {status: "invalid_reply"};
    const telegramChatId = safeId(reply.externalRecipientId, signedTelegramIdPattern);
    const telegramMessageId = safeId(reply.repliedMessageId, positiveTelegramIdPattern);
    if (telegramChatId === null || telegramMessageId === null) return {status: "invalid_reply"};

    try {
      const actor = await this.staffActors.execute({telegramUserId: reply.senderExternalId});
      if (actor.status !== "resolved" || !actor.actor.capabilities.mayReplyToCustomerConversation) return {status: "unauthorized"};
      const binding = await this.deliveries.findConversationByProviderMessage({telegramChatId, telegramMessageId});
      if (!binding) return {status: "conversation_not_found"};

      const message = Message.create({
        id: `telegram_update_${reply.externalUpdateId}`,
        senderType: "INTERNAL_USER",
        channel: "TELEGRAM",
        actorReference: actor.actor.principal.actorReference,
        body: reply.body,
        createdAt: this.clock.now(),
      });
      const result = await this.messages.appendForConversation(binding.conversationId, message);
      return {status: result};
    } catch (error) {
      if (error instanceof ConversationValidationError) return {status: "invalid_reply"};
      return {status: "persistence_failed"};
    }
  }
}
