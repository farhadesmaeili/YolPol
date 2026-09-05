import {scheduleMessageTranslation} from "@/features/conversation-translation/infrastructure/persistence/schedule-message-translation";
import {asc, eq} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import {DuplicateInquiryIdError, type InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Conversation} from "@/features/inquiries/domain/entities/conversation";
import type {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";
import type {InquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import type {CustomerMessageAiFallbackJobPlan} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";
import {conversationAiResponseJobs, conversationAiRoutingPostgresSchema} from "@/features/conversation-ai-routing/infrastructure/persistence/postgres/schema/conversation-ai-routing-schema";
import {aiOperationPolicy, aiOperationsPostgresSchema} from "@/features/ai-operations/infrastructure/persistence/postgres/schema/ai-operations-schema";
import {createInquiryCreatedWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {toInquiry, toInquiryRecord} from "@/features/inquiries/infrastructure/mappers/inquiry-record-mapper";
import type {InquiryRecord} from "@/features/inquiries/infrastructure/records/inquiry-record";
import {conversationAccess, conversationMessages, conversations, inquiries, inquiryItems, inquiryOutbox, inquiryPostgresSchema, inquiryWorkflowEvents} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

const schema = {...inquiryPostgresSchema, ...conversationAiRoutingPostgresSchema, ...aiOperationsPostgresSchema};
type InquiryDatabase = NodePgDatabase<typeof schema>;

function hasPostgresCode(error: unknown, expected: string, depth = 0): boolean {
  if (depth > 3 || typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === expected) return true;
  return "cause" in error && hasPostgresCode(error.cause, expected, depth + 1);
}

export class PostgresInquiryRepository implements InquiryRepository {
  private readonly database: InquiryDatabase;
  constructor(pool: Pool) { this.database = drizzle(pool, {schema}); }

  async save(inquiry: Inquiry, event?: InquiryCreated, conversation?: Conversation, access?: ConversationAccessCredential, aiFallbackJob?: CustomerMessageAiFallbackJobPlan | null): Promise<void> {
    const record = toInquiryRecord(inquiry);
    try {
      await this.database.transaction(async (transaction) => {
        if (access && !conversation) throw new InquiryPersistenceError();
        await transaction.insert(inquiries).values({
          id: record.id, status: record.status, fullName: record.fullName, company: record.company,
          email: record.email, phone: record.phone, whatsappPhone: record.whatsappPhone, telegramUsername: record.telegramUsername,
          preferredContactMethods: [...record.preferredContactMethods], country: record.country, city: record.city,
          destinationCountry: record.destinationCountry, destinationCity: record.destinationCity, message: record.message,
          sourceLocale: record.sourceLocale, sourcePath: record.sourcePath,
          privacyAccepted: record.privacyAccepted, privacyAcceptedAt: new Date(record.privacyAcceptedAt),
          privacyPolicyVersion: record.privacyPolicyVersion, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt),
        });
        await transaction.insert(inquiryItems).values(record.items.map((item, position) => ({inquiryId: record.id, position, ...item})));
        const workflowEvent = createInquiryCreatedWorkflowEvent(record.id, record.status, new Date(record.createdAt));
        await transaction.insert(inquiryWorkflowEvents).values({
          inquiryId: workflowEvent.inquiryId,
          eventType: workflowEvent.type,
          previousValue: workflowEvent.previousValue,
          newValue: workflowEvent.newValue,
          actorReference: workflowEvent.actorReference,
          occurredAt: new Date(workflowEvent.occurredAt),
        });
        if (conversation) {
          if (conversation.inquiryId.value !== inquiry.id.value) throw new InquiryPersistenceError();
          await transaction.insert(conversations).values({id: conversation.id.value, inquiryId: conversation.inquiryId.value, channel: conversation.channel, createdAt: conversation.createdAt});
          if (access) {
            if (access.conversationId.value !== conversation.id.value) throw new InquiryPersistenceError();
            await transaction.insert(conversationAccess).values({conversationId: access.conversationId.value, tokenLookup: access.tokenLookup, tokenHash: access.tokenHash, createdAt: access.createdAt, expiresAt: access.expiresAt});
          }
          if (conversation.messages.length > 0) await transaction.insert(conversationMessages).values(conversation.messages.map((message, position) => ({id: message.id.value, conversationId: conversation.id.value, position, senderType: message.senderType, channel: message.channel, actorReference: message.actorReference?.value ?? null, body: message.body, createdAt: message.createdAt})));
          for (const message of conversation.messages) await scheduleMessageTranslation(transaction, conversation.id.value, message, message.senderType === "CUSTOMER" && message.channel === "WEBSITE" ? record.sourceLocale : undefined);
          if (aiFallbackJob) {
            const [operationsPolicy] = await transaction.select({mode: aiOperationPolicy.mode}).from(aiOperationPolicy)
              .where(eq(aiOperationPolicy.id, "global")).limit(1).for("share");
            const triggerPosition = conversation.messages.findIndex(({id}) => id.value === aiFallbackJob.triggerMessageId);
            const trigger = conversation.messages[triggerPosition];
            if (triggerPosition < 0 || !trigger || trigger.senderType !== "CUSTOMER" || trigger.channel !== "WEBSITE") throw new InquiryPersistenceError();
            if (operationsPolicy && operationsPolicy.mode !== "DISABLED") await transaction.insert(conversationAiResponseJobs).values({
              id: aiFallbackJob.id, conversationId: conversation.id.value, triggerMessageId: trigger.id.value,
              triggerMessagePosition: triggerPosition, status: "PENDING", notBefore: aiFallbackJob.notBefore,
              executionId: aiFallbackJob.executionId, attempts: 0, createdAt: aiFallbackJob.createdAt,
              updatedAt: aiFallbackJob.createdAt, version: 1,
            }).onConflictDoNothing({target: conversationAiResponseJobs.triggerMessageId});
          }
        }
        if (event) {
          await transaction.insert(inquiryOutbox).values({
            id: event.eventId,
            eventType: event.type,
            aggregateId: event.inquiryId,
            payload: {inquiryId: event.inquiryId, occurredAt: event.occurredAt.toISOString()},
            occurredAt: event.occurredAt,
            availableAt: event.occurredAt,
          });
        }
      });
    } catch (error) {
      if (hasPostgresCode(error, "23505")) throw new DuplicateInquiryIdError();
      throw new InquiryPersistenceError();
    }
  }

  async findById(id: string): Promise<Inquiry | null> {
    try {
      const [root] = await this.database.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
      if (!root) return null;
      const items = await this.database.select().from(inquiryItems).where(eq(inquiryItems.inquiryId, id)).orderBy(asc(inquiryItems.position));
      const record: InquiryRecord = {
        id: root.id, status: root.status as InquiryRecord["status"], fullName: root.fullName, company: root.company,
        email: root.email, phone: root.phone, whatsappPhone: root.whatsappPhone, telegramUsername: root.telegramUsername,
        preferredContactMethods: root.preferredContactMethods as InquiryRecord["preferredContactMethods"],
        country: root.country, city: root.city, destinationCountry: root.destinationCountry, destinationCity: root.destinationCity,
        message: root.message, sourceLocale: root.sourceLocale as InquiryRecord["sourceLocale"], sourcePath: root.sourcePath,
        privacyAccepted: root.privacyAccepted, privacyAcceptedAt: root.privacyAcceptedAt.toISOString(),
        privacyPolicyVersion: root.privacyPolicyVersion, createdAt: root.createdAt.toISOString(), updatedAt: root.updatedAt.toISOString(),
        items: items.map((item) => ({productId: item.productId, sku: item.sku, slug: item.slug, productName: item.productName, quantity: item.quantity, unit: item.unit as InquiryRecord["items"][number]["unit"]})),
      };
      return toInquiry(record);
    } catch {
      throw new InquiryPersistenceError();
    }
  }
}
