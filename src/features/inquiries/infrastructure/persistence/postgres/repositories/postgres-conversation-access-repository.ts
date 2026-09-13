import {eq} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {ConversationAccessRepository} from "@/features/inquiries/application/ports/conversation-access-ports";
import {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {conversationAccess, conversations, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;

export class PostgresConversationAccessRepository implements ConversationAccessRepository {
  private readonly database: InquiryDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async findByLookup(lookup: string) {
    try {
      const [row] = await this.database.select({
        conversationId: conversationAccess.conversationId,
        inquiryId: conversations.inquiryId,
        tokenLookup: conversationAccess.tokenLookup,
        tokenHash: conversationAccess.tokenHash,
        createdAt: conversationAccess.createdAt,
        expiresAt: conversationAccess.expiresAt,
      })
        .from(conversationAccess)
        .innerJoin(conversations, eq(conversations.id, conversationAccess.conversationId))
        .where(eq(conversationAccess.tokenLookup, lookup))
        .limit(1);
      if (!row) return null;
      return Object.freeze({
        credential: ConversationAccessCredential.create({...row, expiresAt: row.expiresAt ?? undefined}),
        inquiryId: row.inquiryId,
      });
    } catch {
      throw new InquiryPersistenceError();
    }
  }
}
