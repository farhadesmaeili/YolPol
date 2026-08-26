import "server-only";

import {ResolveConversationForInquiry} from "@/features/inquiries/application/use-cases/resolve-conversation-for-inquiry";
import {UpdateConversationTyping} from "@/features/inquiries/application/use-cases/update-conversation-typing";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {InMemoryConversationTypingRegistry} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-typing-registry";

const processState = globalThis as typeof globalThis & {
  __yolpolConversationTypingRegistry?: InMemoryConversationTypingRegistry;
};
const registry = processState.__yolpolConversationTypingRegistry ??= new InMemoryConversationTypingRegistry();
const updateTyping = new UpdateConversationTyping(registry);
let resolveConversation: ResolveConversationForInquiry | undefined;

export function getConversationTypingRegistry(): InMemoryConversationTypingRegistry { return registry; }
export function getConversationTypingUpdater(): UpdateConversationTyping { return updateTyping; }
export function getConversationForInquiryResolver(): ResolveConversationForInquiry {
  resolveConversation ??= new ResolveConversationForInquiry(new PostgresConversationMessageRepository(getInquiryPostgresPool()));
  return resolveConversation;
}
