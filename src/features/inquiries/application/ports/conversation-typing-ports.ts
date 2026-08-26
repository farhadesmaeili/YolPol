export const conversationTypingParticipants = ["CUSTOMER", "STAFF"] as const;

export type ConversationTypingParticipant = (typeof conversationTypingParticipants)[number];

export type ConversationTypingEvent = Readonly<{
  participant: ConversationTypingParticipant;
  isTyping: boolean;
}>;

export type ConversationTypingListener = (event: ConversationTypingEvent) => void;

export interface ConversationTypingSubscription {
  close(): void;
}

export interface ConversationTypingRegistry {
  update(input: Readonly<{
    conversationId: string;
    participant: ConversationTypingParticipant;
    actorKey: string;
    isTyping: boolean;
  }>): void;
  subscribe(input: Readonly<{
    conversationId: string;
    participant: ConversationTypingParticipant;
    listener: ConversationTypingListener;
  }>): ConversationTypingSubscription | null;
}
