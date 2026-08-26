import {and, asc, eq, gt, max} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {AppendConversationMessageResult, ConversationMessageRepository, ConversationReferenceReader} from "@/features/inquiries/application/ports/conversation-ports";
import {Message} from "@/features/inquiries/domain/entities/message";
import {conversationChannels, messageSenderTypes} from "@/features/inquiries/domain/types/conversation-types";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {conversationMessages, conversations, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;

export class PostgresConversationMessageRepository implements ConversationMessageRepository, ConversationReferenceReader {
  private readonly database: InquiryDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async findConversationIdForInquiry(inquiryId: string): Promise<string | null> {
    try {
      const [conversation] = await this.database.select({id: conversations.id})
        .from(conversations)
        .where(eq(conversations.inquiryId, inquiryId))
        .limit(1);
      return conversation?.id ?? null;
    } catch {
      throw new InquiryPersistenceError();
    }
  }

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
          actorReference: message.actorReference?.value ?? null,
          body: message.body,
          createdAt: message.createdAt,
        }).onConflictDoNothing({target: conversationMessages.id}).returning({id: conversationMessages.id});
        return inserted.length === 1 ? "created" : "duplicate";
      });
    } catch {
      throw new InquiryPersistenceError();
    }
  }

  async findForInquiry(inquiryId: string): Promise<readonly Message[] | null> {
    try {
      const [conversation] = await this.database.select({id: conversations.id})
        .from(conversations)
        .where(eq(conversations.inquiryId, inquiryId))
        .limit(1);
      if (!conversation) return null;

      const rows = await this.database.select({
        id: conversationMessages.id,
        senderType: conversationMessages.senderType,
        channel: conversationMessages.channel,
        actorReference: conversationMessages.actorReference,
        body: conversationMessages.body,
        createdAt: conversationMessages.createdAt,
      })
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversation.id))
        .orderBy(asc(conversationMessages.position));
      return Object.freeze(rows.map((row) => {
        const senderType = messageSenderTypes.find((value) => value === row.senderType);
        const channel = conversationChannels.find((value) => value === row.channel);
        if (!senderType || !channel) throw new InquiryPersistenceError();
        return Message.create({...row, senderType, channel});
      }));
    } catch {
      throw new InquiryPersistenceError();
    }
  }

  async findAfterPositionForInquiry(inquiryId: string, afterPosition: number, limit: number) {
    try {
      const [conversation] = await this.database.select({id: conversations.id})
        .from(conversations)
        .where(eq(conversations.inquiryId, inquiryId))
        .limit(1);
      if (!conversation) return null;

      const rows = await this.database.select({
        position: conversationMessages.position,
        id: conversationMessages.id,
        senderType: conversationMessages.senderType,
        channel: conversationMessages.channel,
        actorReference: conversationMessages.actorReference,
        body: conversationMessages.body,
        createdAt: conversationMessages.createdAt,
      })
        .from(conversationMessages)
        .where(and(eq(conversationMessages.conversationId, conversation.id), gt(conversationMessages.position, afterPosition)))
        .orderBy(asc(conversationMessages.position))
        .limit(limit);
      return Object.freeze(rows.map((row) => {
        const senderType = messageSenderTypes.find((value) => value === row.senderType);
        const channel = conversationChannels.find((value) => value === row.channel);
        if (!senderType || !channel) throw new InquiryPersistenceError();
        return Object.freeze({position: row.position, message: Message.create({...row, senderType, channel})});
      }));
    } catch {
      throw new InquiryPersistenceError();
    }
  }
}
