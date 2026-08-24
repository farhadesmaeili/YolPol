import {DuplicateInquiryIdError, type CatalogProduct, type Clock, type InquiryIdGenerator, type InquiryProductCatalog} from "@/features/inquiries/application/ports/inquiry-ports";
import type {InquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {InquiryReconstitutionInput} from "@/features/inquiries/domain/types/inquiry-types";

const snapshot = (inquiry: Inquiry): InquiryReconstitutionInput => ({id: inquiry.id.value, contact: {...inquiry.contact}, location: {...inquiry.location}, destination: inquiry.destination ? {...inquiry.destination} : undefined, message: inquiry.message, privacy: {...inquiry.privacy, acceptedAt: inquiry.privacy.acceptedAt}, source: {...inquiry.source}, items: inquiry.items.map((item) => ({...item})), status: inquiry.status, createdAt: inquiry.createdAt, updatedAt: inquiry.updatedAt});
const restore = (value: InquiryReconstitutionInput): Inquiry => Inquiry.reconstitute({...value, contact: {...value.contact}, location: {...value.location}, destination: value.destination ? {...value.destination} : undefined, privacy: {...value.privacy, acceptedAt: new Date(value.privacy.acceptedAt)}, source: {...value.source}, items: value.items.map((item) => ({...item})), createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt)});

export class FakeInquiryRepository {
  private readonly records: InquiryReconstitutionInput[] = []; readonly events: InquiryCreated[] = []; failWith?: Error;
  constructor(private readonly operations: string[] = []) {}
  get saved(): readonly Inquiry[] { return this.records.map(restore); }
  async save(inquiry: Inquiry, event?: InquiryCreated) { this.operations.push("persist"); if (this.failWith) throw this.failWith; if (this.records.some(({id}) => id === inquiry.id.value)) throw new DuplicateInquiryIdError(); this.records.push(snapshot(inquiry)); if (event) this.events.push(event); }
  async findById(id: string) { const found = this.records.find((entry) => entry.id === id); return found ? restore(found) : null; }
}
export class FakeInquiryProductCatalog implements InquiryProductCatalog { requestedIds: string[] = []; failWith?: unknown; constructor(readonly products: readonly CatalogProduct[]) {} async findById(id: string) { this.requestedIds.push(id); if (this.failWith !== undefined) throw this.failWith; return this.products.find((product) => product.id === id) ?? null; } }
export class FakeInquiryIdGenerator implements InquiryIdGenerator { calls = 0; failWith?: unknown; constructor(private readonly id = "test-inquiry-generated") {} generate() { this.calls += 1; if (this.failWith !== undefined) throw this.failWith; return this.id; } }
export class FakeClock implements Clock { calls = 0; failWith?: unknown; constructor(private readonly instant = new Date("2026-02-01T00:00:00.000Z")) {} now() { this.calls += 1; if (this.failWith !== undefined) throw this.failWith; return new Date(this.instant); } }
