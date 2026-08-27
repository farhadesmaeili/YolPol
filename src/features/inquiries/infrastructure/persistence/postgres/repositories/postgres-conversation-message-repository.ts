import {createHash} from "node:crypto";

import {and, asc, eq, gt, max} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {AppendConversationMessageResult, CustomerWebsiteConversationMessageWriter, InquiryNotificationConversationReader, ConversationMessageRepository} from "@/features/inquiries/application/ports/conversation-ports";
import {Message} from "@/features/inquiries/domain/entities/message";
import {createCustomerConversationMessageCreated} from "@/features/inquiries/domain/events/customer-conversation-message-created";
import {conversationChannels, messageSenderTypes} from "@/features/inquiries/domain/types/conversation-types";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {conversationMessages, conversations, inquiryOutbox, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;
const customerMessageEventIdDomain = "yolpol:customer-conversation-message-created:v1";

function customerMessageEventId(messageId: string): string {
  const digest = createHash("sha256").update(customerMessageEventIdDomain).update("\0").update(messageId).digest("hex");
  return `customer_message_${digest}`;
}

export class PostgresConversationMessageRepository implements ConversationMessageRepository, CustomerWebsiteConversationMessageWriter, InquiryNotificationConversationReader {
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
    return this.appendForInquiryTransaction(inquiryId, message, false);
  }

  async appendCustomerWebsiteForInquiry(inquiryId: string, message: Message): Promise<AppendConversationMessageResult> {
    if (message.senderType !== "CUSTOMER" || message.channel !== "WEBSITE") throw new InquiryPersistenceError();
    return this.appendForInquiryTransaction(inquiryId, message, true);
  }

  private async appendForInquiryTransaction(inquiryId: string, message: Message, notifyCustomerMessage: boolean): Promise<AppendConversationMessageResult> {
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
        if (inserted.length !== 1) return "duplicate";

        if (notifyCustomerMessage) {
          const event = createCustomerConversationMessageCreated({
            eventId: customerMessageEventId(message.id.value),
            inquiryId,
            conversationId: conversation.id,
            messageId: message.id.value,
            occurredAt: message.createdAt,
          });
          await transaction.insert(inquiryOutbox).values({
            id: event.eventId,
            eventType: event.type,
            aggregateId: event.inquiryId,
            payload: {
              inquiryId: event.inquiryId,
              conversationId: event.conversationId,
              messageId: event.messageId,
              occurredAt: event.occurredAt.toISOString(),
            },
            occurredAt: event.occurredAt,
            availableAt: event.occurredAt,
          });
        }
        return "created";
      });
    } catch {
      throw new InquiryPersistenceError();
    }
  }

  async findCustomerWebsiteMessage(input: Readonly<{inquiryId: string; conversationId: string; messageId: string}>): Promise<Message | null> {
    try {
      const [row] = await this.database.select({
        id: conversationMessages.id,
        senderType: conversationMessages.senderType,
        channel: conversationMessages.channel,
        actorReference: conversationMessages.actorReference,
        body: conversationMessages.body,
        createdAt: conversationMessages.createdAt,
      }).from(conversationMessages)
        .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
        .where(and(
          eq(conversations.inquiryId, input.inquiryId),
          eq(conversations.id, input.conversationId),
          eq(conversationMessages.id, input.messageId),
          eq(conversationMessages.senderType, "CUSTOMER"),
          eq(conversationMessages.channel, "WEBSITE"),
        )).limit(1);
      return row ? Message.create({...row, senderType: "CUSTOMER", channel: "WEBSITE"}) : null;
    } catch {
      throw new InquiryPersistenceError();
    }
  }

  async appendForConversation(conversationId: string, message: Message): Promise<AppendConversationMessageResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [conversation] = await transaction.select({id: conversations.id})
          .from(conversations)
          .where(eq(conversations.id, conversationId))
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
    } catch { throw new InquiryPersistenceError(); }
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

  async findPositionedForInquiry(inquiryId: string) {
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
        .where(eq(conversationMessages.conversationId, conversation.id))
        .orderBy(asc(conversationMessages.position));
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
