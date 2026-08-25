import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";

export type ConversationMessageUpdate = Readonly<{
  cursor: number;
  message: ConversationMessageDto;
}>;

export type ConversationUpdateListener = (update: ConversationMessageUpdate) => void;

export interface ConversationUpdateRegistration {
  publish(updates: readonly ConversationMessageUpdate[]): void;
  close(): void;
}

export interface ConversationUpdateStreamRegistry {
  register(input: Readonly<{
    conversationId: string;
    afterCursor: number;
    listener: ConversationUpdateListener;
  }>): ConversationUpdateRegistration | null;
}

export interface ConversationPollingDelay {
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}
