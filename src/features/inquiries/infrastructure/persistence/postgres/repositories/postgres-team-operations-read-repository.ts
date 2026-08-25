import type {Pool, QueryResultRow} from "pg";

import type {
  AssignableTeamMemberDto,
  TeamInquiryAssignmentDto,
  TeamInquiryDetailDto,
  TeamInquiryItemDto,
  TeamInquiryListItemDto,
} from "@/features/inquiries/application/dto/team-operations-dto";
import type {
  TeamInquiryDetailSnapshot,
  TeamInquiryListQuery,
  TeamOperationsReadRepository,
} from "@/features/inquiries/application/ports/team-operations-read-port";
import {conversationChannels, messageSenderTypes, type ConversationChannel, type MessageSenderType} from "@/features/inquiries/domain/types/conversation-types";
import {inquiryStatuses, inquiryUnits, storedContactMethods, type InquiryStatus, type InquiryUnit, type StoredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";

type ListRow = QueryResultRow & {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  customerDisplayName: string;
  company: string | null;
  country: string;
  city: string | null;
  destinationCountry: string | null;
  destinationCity: string | null;
  teamMemberId: string | null;
  teamMemberDisplayName: string | null;
  assignedAt: Date | null;
  items: unknown;
  messageCount: number;
  latestSenderType: string | null;
  latestChannel: string | null;
  latestMessageAt: Date | null;
};

type DetailRow = QueryResultRow & {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  company: string | null;
  email: string;
  phone: string;
  whatsappPhone: string | null;
  telegramUsername: string | null;
  preferredMethods: unknown;
  country: string;
  city: string | null;
  destinationCountry: string | null;
  destinationCity: string | null;
  message: string | null;
  teamMemberId: string | null;
  teamMemberDisplayName: string | null;
  assignedAt: Date | null;
  items: unknown;
};

type TeamMemberRow = QueryResultRow & {id: string; displayName: string; active: boolean};

function string(value: unknown): string {
  if (typeof value !== "string") throw new InquiryPersistenceError();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value !== null && typeof value !== "string") throw new InquiryPersistenceError();
  return value;
}

function instant(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new InquiryPersistenceError();
  return value.toISOString();
}

function inquiryStatus(value: unknown): InquiryStatus {
  const status = inquiryStatuses.find((candidate) => candidate === value);
  if (!status) throw new InquiryPersistenceError();
  return status;
}

function inquiryUnit(value: unknown): InquiryUnit {
  const unit = inquiryUnits.find((candidate) => candidate === value);
  if (!unit) throw new InquiryPersistenceError();
  return unit;
}

function senderType(value: unknown): MessageSenderType {
  const sender = messageSenderTypes.find((candidate) => candidate === value);
  if (!sender) throw new InquiryPersistenceError();
  return sender;
}

function channel(value: unknown): ConversationChannel {
  const matched = conversationChannels.find((candidate) => candidate === value);
  if (!matched) throw new InquiryPersistenceError();
  return matched;
}

function preferredMethods(value: unknown): readonly StoredContactMethod[] {
  if (!Array.isArray(value)) throw new InquiryPersistenceError();
  const methods = value.map((entry) => storedContactMethods.find((method) => method === entry));
  if (methods.some((method) => method === undefined)) throw new InquiryPersistenceError();
  return Object.freeze(methods as StoredContactMethod[]);
}

function item(value: unknown): TeamInquiryItemDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InquiryPersistenceError();
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.quantity) || (record.quantity as number) < 1) throw new InquiryPersistenceError();
  return Object.freeze({
    productId: string(record.productId),
    sku: string(record.sku),
    productName: string(record.productName),
    quantity: record.quantity as number,
    unit: inquiryUnit(record.unit),
  });
}

function items(value: unknown): readonly TeamInquiryItemDto[] {
  if (!Array.isArray(value)) throw new InquiryPersistenceError();
  return Object.freeze(value.map(item));
}

function assignment(row: Pick<ListRow, "teamMemberId" | "teamMemberDisplayName" | "assignedAt">): TeamInquiryAssignmentDto | null {
  if (row.teamMemberId === null && row.teamMemberDisplayName === null && row.assignedAt === null) return null;
  if (row.teamMemberId === null || row.teamMemberDisplayName === null || row.assignedAt === null) throw new InquiryPersistenceError();
  return Object.freeze({
    teamMemberId: string(row.teamMemberId),
    displayName: string(row.teamMemberDisplayName),
    assignedAt: instant(row.assignedAt),
  });
}

function mapListRow(row: ListRow): TeamInquiryListItemDto {
  if (!Number.isInteger(row.messageCount) || row.messageCount < 0) throw new InquiryPersistenceError();
  const hasLatestMessage = row.latestSenderType !== null || row.latestChannel !== null || row.latestMessageAt !== null;
  if (hasLatestMessage && (row.latestSenderType === null || row.latestChannel === null || row.latestMessageAt === null)) throw new InquiryPersistenceError();
  return Object.freeze({
    id: string(row.id),
    status: inquiryStatus(row.status),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    customerDisplayName: string(row.customerDisplayName),
    company: nullableString(row.company),
    origin: Object.freeze({country: string(row.country), city: nullableString(row.city)}),
    destination: Object.freeze({country: nullableString(row.destinationCountry), city: nullableString(row.destinationCity)}),
    assignment: assignment(row),
    items: items(row.items),
    conversationActivity: Object.freeze({
      messageCount: row.messageCount,
      latestMessage: hasLatestMessage ? Object.freeze({
        senderType: senderType(row.latestSenderType),
        channel: channel(row.latestChannel),
        createdAt: instant(row.latestMessageAt),
      }) : null,
    }),
  });
}

function mapDetailRow(row: DetailRow): TeamInquiryDetailSnapshot {
  const detailInquiry: TeamInquiryDetailDto["inquiry"] = Object.freeze({
    id: string(row.id),
    status: inquiryStatus(row.status),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    contact: Object.freeze({
      fullName: string(row.fullName),
      company: nullableString(row.company),
      email: string(row.email),
      phone: string(row.phone),
      whatsappPhone: nullableString(row.whatsappPhone),
      telegramUsername: nullableString(row.telegramUsername),
      preferredMethods: preferredMethods(row.preferredMethods),
    }),
    location: Object.freeze({country: string(row.country), city: nullableString(row.city)}),
    destination: Object.freeze({country: nullableString(row.destinationCountry), city: nullableString(row.destinationCity)}),
    message: nullableString(row.message),
    items: items(row.items),
  });
  return Object.freeze({inquiry: detailInquiry, assignment: assignment(row)});
}

const listProjection = `
  with page as (
    select
      i.id,
      i.status,
      i.created_at as "createdAt",
      i.updated_at as "updatedAt",
      i.full_name as "customerDisplayName",
      i.company,
      i.country,
      i.city,
      i.destination_country as "destinationCountry",
      i.destination_city as "destinationCity",
      a.team_member_id as "teamMemberId",
      tm.display_name as "teamMemberDisplayName",
      a.assigned_at as "assignedAt"
    from inquiries i
    left join inquiry_assignments a on a.inquiry_id = i.id
    left join inquiry_team_members tm on tm.id = a.team_member_id
`;

const listEnrichment = `
  )
  select
    page.*,
    coalesce(item_summary.items, '[]'::jsonb) as items,
    coalesce(message_count.value, 0) as "messageCount",
    latest_message.sender_type as "latestSenderType",
    latest_message.channel as "latestChannel",
    latest_message.created_at as "latestMessageAt"
  from page
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'productId', ii.product_id,
      'sku', ii.sku,
      'productName', ii.product_name,
      'quantity', ii.quantity,
      'unit', ii.unit
    ) order by ii.position) as items
    from inquiry_items ii
    where ii.inquiry_id = page.id
  ) item_summary on true
  left join lateral (
    select count(cm.id)::integer as value
    from conversations c
    left join conversation_messages cm on cm.conversation_id = c.id
    where c.inquiry_id = page.id
  ) message_count on true
  left join lateral (
    select cm.sender_type, cm.channel, cm.created_at
    from conversations c
    join conversation_messages cm on cm.conversation_id = c.id
    where c.inquiry_id = page.id
    order by cm.position desc
    limit 1
  ) latest_message on true
  order by page."createdAt" desc, page.id desc
`;

export class PostgresTeamOperationsReadRepository implements TeamOperationsReadRepository {
  constructor(private readonly pool: Pool) {}

  async listInquiries(query: TeamInquiryListQuery): Promise<readonly TeamInquiryListItemDto[]> {
    const values: unknown[] = [];
    const predicates: string[] = [];
    const parameter = (value: unknown): number => { values.push(value); return values.length; };

    if (query.cursor) {
      const createdAt = parameter(query.cursor.createdAt);
      const inquiryId = parameter(query.cursor.inquiryId);
      predicates.push(`(i.created_at, i.id) < ($${createdAt}::timestamptz, $${inquiryId}::varchar)`);
    }
    if (query.status) predicates.push(`i.status = $${parameter(query.status)}`);
    if (query.assignment?.type === "assigned") predicates.push(`a.team_member_id = $${parameter(query.assignment.teamMemberId)}`);
    if (query.assignment?.type === "unassigned") predicates.push("a.inquiry_id is null");
    const limit = parameter(query.limit);
    const where = predicates.length === 0 ? "" : `where ${predicates.join(" and ")}`;

    try {
      const result = await this.pool.query<ListRow>(`${listProjection}
        ${where}
        order by i.created_at desc, i.id desc
        limit $${limit}
        ${listEnrichment}`, values);
      return Object.freeze(result.rows.map(mapListRow));
    } catch { throw new InquiryPersistenceError(); }
  }

  async findInquiryDetail(inquiryId: string): Promise<TeamInquiryDetailSnapshot | null> {
    try {
      const result = await this.pool.query<DetailRow>(`
        select
          i.id,
          i.status,
          i.created_at as "createdAt",
          i.updated_at as "updatedAt",
          i.full_name as "fullName",
          i.company,
          i.email,
          i.phone,
          i.whatsapp_phone as "whatsappPhone",
          i.telegram_username as "telegramUsername",
          i.preferred_contact_methods as "preferredMethods",
          i.country,
          i.city,
          i.destination_country as "destinationCountry",
          i.destination_city as "destinationCity",
          i.message,
          a.team_member_id as "teamMemberId",
          tm.display_name as "teamMemberDisplayName",
          a.assigned_at as "assignedAt",
          coalesce(item_summary.items, '[]'::jsonb) as items
        from inquiries i
        left join inquiry_assignments a on a.inquiry_id = i.id
        left join inquiry_team_members tm on tm.id = a.team_member_id
        left join lateral (
          select jsonb_agg(jsonb_build_object(
            'productId', ii.product_id,
            'sku', ii.sku,
            'productName', ii.product_name,
            'quantity', ii.quantity,
            'unit', ii.unit
          ) order by ii.position) as items
          from inquiry_items ii
          where ii.inquiry_id = i.id
        ) item_summary on true
        where i.id = $1
        limit 1
      `, [inquiryId]);
      return result.rows[0] ? mapDetailRow(result.rows[0]) : null;
    } catch { throw new InquiryPersistenceError(); }
  }

  async listTeamMembers(query: Readonly<{activeOnly: true}>): Promise<readonly AssignableTeamMemberDto[]> {
    if (query.activeOnly !== true) throw new InquiryPersistenceError();
    try {
      const result = await this.pool.query<TeamMemberRow>(`
        select id, display_name as "displayName", active
        from inquiry_team_members
        where active = true
        order by display_name asc, id asc
      `);
      return Object.freeze(result.rows.map((row) => {
        if (typeof row.id !== "string" || typeof row.displayName !== "string" || row.active !== true) throw new InquiryPersistenceError();
        return Object.freeze({id: row.id, displayName: row.displayName, active: true as const});
      }));
    } catch { throw new InquiryPersistenceError(); }
  }
}
