import {and, asc, eq} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {CommunicationChannel, CommunicationRecipient, CommunicationRecipientKind, CommunicationRecipientRepository} from "@/features/inquiries/application/ports/communication-ports";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {communicationRecipients, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;

export class PostgresCommunicationRecipientRepository implements CommunicationRecipientRepository {
  private readonly database: InquiryDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async findAuthorizedNotificationRecipients(channel: CommunicationChannel): Promise<readonly CommunicationRecipient[]> {
    try {
      const rows = await this.database.select({
        id: communicationRecipients.id,
        channel: communicationRecipients.channel,
        kind: communicationRecipients.kind,
        externalId: communicationRecipients.externalId,
        displayName: communicationRecipients.displayName,
      }).from(communicationRecipients).where(and(
        eq(communicationRecipients.channel, channel),
        eq(communicationRecipients.authorized, true),
        eq(communicationRecipients.notificationsEnabled, true),
      )).orderBy(asc(communicationRecipients.id));
      return Object.freeze(rows.map((row) => Object.freeze({...row, channel: row.channel as CommunicationChannel, kind: row.kind as CommunicationRecipientKind})));
    } catch {
      throw new InquiryPersistenceError();
    }
  }
}
