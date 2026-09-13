import {DuplicateInquiryIdError, type CatalogProduct, type Clock, type InquiryIdGenerator, type InquiryProductCatalog} from "@/features/inquiries/application/ports/inquiry-ports";
import type {InquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Conversation} from "@/features/inquiries/domain/entities/conversation";
import type {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";
import type {InquiryReconstitutionInput} from "@/features/inquiries/domain/types/inquiry-types";
import type {InquiryAssignmentSnapshot, InquiryStatusSnapshot, InquiryWorkflowRepository, WorkflowWriteResult} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import {InquiryAssignment} from "@/features/inquiries/domain/entities/inquiry-assignment";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";
import type {InquiryWorkflowEvent, StoredInquiryWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import type {CustomerMessageAiFallbackJobPlan} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

const snapshot = (inquiry: Inquiry): InquiryReconstitutionInput => ({id: inquiry.id.value, contact: {...inquiry.contact}, location: {...inquiry.location}, destination: inquiry.destination ? {...inquiry.destination} : undefined, message: inquiry.message, privacy: {...inquiry.privacy, acceptedAt: inquiry.privacy.acceptedAt}, source: {...inquiry.source}, items: inquiry.items.map((item) => ({...item})), status: inquiry.status, createdAt: inquiry.createdAt, updatedAt: inquiry.updatedAt});
const restore = (value: InquiryReconstitutionInput): Inquiry => Inquiry.reconstitute({...value, contact: {...value.contact}, location: {...value.location}, destination: value.destination ? {...value.destination} : undefined, privacy: {...value.privacy, acceptedAt: new Date(value.privacy.acceptedAt)}, source: {...value.source}, items: value.items.map((item) => ({...item})), createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt)});

export class FakeInquiryRepository {
  private readonly records: InquiryReconstitutionInput[] = []; readonly events: InquiryCreated[] = []; readonly conversations: Conversation[] = []; readonly conversationAccess: ConversationAccessCredential[] = []; readonly aiFallbackJobs: CustomerMessageAiFallbackJobPlan[] = []; failWith?: Error;
  constructor(private readonly operations: string[] = []) {}
  get saved(): readonly Inquiry[] { return this.records.map(restore); }
  async save(inquiry: Inquiry, event?: InquiryCreated, conversation?: Conversation, access?: ConversationAccessCredential, aiFallbackJob?: CustomerMessageAiFallbackJobPlan | null) { this.operations.push("persist"); if (this.failWith) throw this.failWith; if (this.records.some(({id}) => id === inquiry.id.value)) throw new DuplicateInquiryIdError(); this.records.push(snapshot(inquiry)); if (event) this.events.push(event); if (conversation) this.conversations.push(conversation); if (access) this.conversationAccess.push(access); if (aiFallbackJob) this.aiFallbackJobs.push(aiFallbackJob); }
  async findById(id: string) { const found = this.records.find((entry) => entry.id === id); return found ? restore(found) : null; }
}
export class FakeInquiryProductCatalog implements InquiryProductCatalog { requestedIds: string[] = []; failWith?: unknown; constructor(readonly products: readonly CatalogProduct[]) {} async findById(id: string) { this.requestedIds.push(id); if (this.failWith !== undefined) throw this.failWith; return this.products.find((product) => product.id === id) ?? null; } }
export class FakeInquiryIdGenerator implements InquiryIdGenerator { calls = 0; failWith?: unknown; constructor(private readonly id = "test-inquiry-generated") {} generate() { this.calls += 1; if (this.failWith !== undefined) throw this.failWith; return this.id; } }
export class FakeClock implements Clock { calls = 0; failWith?: unknown; constructor(private instant = new Date("2026-02-01T00:00:00.000Z"), private readonly stepMilliseconds = 0) {} now() { this.calls += 1; if (this.failWith !== undefined) throw this.failWith; const value = new Date(this.instant); this.instant = new Date(this.instant.getTime() + this.stepMilliseconds); return value; } }

export class FakeInquiryWorkflowRepository implements InquiryWorkflowRepository {
  readonly events: StoredInquiryWorkflowEvent[] = [];
  readonly statusSnapshots: InquiryStatusSnapshot[] = [];
  readonly assignmentSnapshots: InquiryAssignmentSnapshot[] = [];
  readonly members = new Map<string, TeamMember>();
  readonly assignments = new Map<string, Readonly<{teamMemberId: string; changedAt: Date}>>();
  nextWriteResult: WorkflowWriteResult = "changed";
  failWith?: Error;

  addTeamMember(id: string, active = true): void { this.members.set(id, TeamMember.reconstitute(id, active)); }
  seedEvent(event: StoredInquiryWorkflowEvent): void { this.events.push(Object.freeze({...event})); }

  async findAssignment(inquiryId: string): Promise<InquiryAssignment> {
    if (this.failWith) throw this.failWith;
    const stored = this.assignments.get(inquiryId);
    return stored ? InquiryAssignment.reconstitute(inquiryId, stored.teamMemberId, stored.changedAt) : InquiryAssignment.unassigned(inquiryId);
  }

  async findTeamMember(id: string): Promise<TeamMember | null> {
    if (this.failWith) throw this.failWith;
    return this.members.get(id) ?? null;
  }

  async changeStatus(_inquiry: Inquiry, expected: InquiryStatusSnapshot, event: InquiryWorkflowEvent): Promise<WorkflowWriteResult> {
    if (this.failWith) throw this.failWith;
    this.statusSnapshots.push(Object.freeze({status: expected.status, updatedAt: new Date(expected.updatedAt)}));
    if (this.nextWriteResult === "changed") this.store(event);
    return this.nextWriteResult;
  }

  async changeAssignment(assignment: InquiryAssignment, expected: InquiryAssignmentSnapshot, event: InquiryWorkflowEvent): Promise<WorkflowWriteResult> {
    if (this.failWith) throw this.failWith;
    this.assignmentSnapshots.push(Object.freeze({teamMemberId: expected.teamMemberId, changedAt: expected.changedAt ? new Date(expected.changedAt) : null}));
    if (this.nextWriteResult === "changed") {
      if (assignment.teamMemberId === null) this.assignments.delete(assignment.inquiryId.value);
      else this.assignments.set(assignment.inquiryId.value, Object.freeze({teamMemberId: assignment.teamMemberId, changedAt: assignment.changedAt!}));
      this.store(event);
    }
    return this.nextWriteResult;
  }

  async readHistory(inquiryId: string): Promise<readonly StoredInquiryWorkflowEvent[]> {
    if (this.failWith) throw this.failWith;
    return Object.freeze(this.events.filter((event) => event.inquiryId === inquiryId).map((event) => Object.freeze({...event})));
  }

  private store(event: InquiryWorkflowEvent): void { this.events.push(Object.freeze({...event, id: String(this.events.length + 1)})); }
}
