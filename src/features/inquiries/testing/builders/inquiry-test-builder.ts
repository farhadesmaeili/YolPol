import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {InquiryCreateInput, InquiryReconstitutionInput} from "@/features/inquiries/domain/types/inquiry-types";
import {inquiryFixture} from "@/features/inquiries/testing/fixtures/inquiry-fixtures";

export class InquiryTestBuilder {
  private input: InquiryCreateInput = {...inquiryFixture, contact: {...inquiryFixture.contact}, location: {...inquiryFixture.location}, destination: {...inquiryFixture.destination}, privacy: {...inquiryFixture.privacy}, source: {...inquiryFixture.source}, items: inquiryFixture.items.map((item) => ({...item}))};
  with(value: Partial<InquiryCreateInput>): this { this.input = {...this.input, ...value}; return this; }
  buildNew(): Inquiry { return Inquiry.create(this.input); }
  buildReconstituted(value: Partial<Pick<InquiryReconstitutionInput, "status" | "updatedAt">> = {}): Inquiry { return Inquiry.reconstitute({...this.input, status: value.status ?? "received", updatedAt: value.updatedAt ?? this.input.createdAt}); }
}
