import {eq, max} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {AppendConversationMessageResult, ConversationMessageRepository} from "@/features/inquiries/application/ports/conversation-ports";
import type {Message} from "@/features/inquiries/domain/entities/message";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {conversationMessages, conversations, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;

export class PostgresConversationMessageRepository implements ConversationMessageRepository {
  private readonly database: InquiryDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async appendForInquiry(inquiryId: string, message: Message): Promise<AppendConversationMessageResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [conversation] = await transaction.select({id: conversations.id})
          .from(conversations)
          .where(eq(conversations.inquiryId, inquiryId))
          .limit(1)
          .for("update");
        if (!conversation) return "conversation_not_found";

        const [latest] = await transaction.select({position: max(conversationMessages.position)})
          .from(conversationMessages)
          .where(eq(conversationMessages.conversationId, conversation.id));
        const inserted = await transaction.insert(conversationMessages).values({
          id: message.id.value,
          conversationId: conversation.id,
          position: (latest?.position ?? -1) + 1,
          senderType: message.senderType,
          channel: message.channel,
          body: message.body,
          createdAt: message.createdAt,
        }).onConflictDoNothing({target: conversationMessages.id}).returning({id: conversationMessages.id});
        return inserted.length === 1 ? "created" : "duplicate";
      });
    } catch {
      throw new InquiryPersistenceError();
    }
  }
}
