import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";

export type ConversationMessageUpdate<TMessage extends ConversationMessageDto = ConversationMessageDto> = Readonly<{
  cursor: number;
  message: TMessage;
}>;

export type ConversationUpdateListener<TMessage extends ConversationMessageDto = ConversationMessageDto> = (
  update: ConversationMessageUpdate<TMessage>,
) => void;

export interface ConversationUpdateRegistration<TMessage extends ConversationMessageDto = ConversationMessageDto> {
  publish(updates: readonly ConversationMessageUpdate<TMessage>[]): void;
  close(): void;
}

export interface ConversationUpdateStreamRegistry<TMessage extends ConversationMessageDto = ConversationMessageDto> {
  register(input: Readonly<{
    conversationId: string;
    afterCursor: number;
    listener: ConversationUpdateListener<TMessage>;
  }>): ConversationUpdateRegistration<TMessage> | null;
}

export interface ConversationPollingDelay {
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}
