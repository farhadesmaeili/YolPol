import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";

export class InquiryId {
  private constructor(readonly value: string) { Object.freeze(this); }
  static create(value: string): InquiryId {
    if (typeof value !== "string" || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new InquiryValidationError("id", "Inquiry ID must be a 1-128 character URL-safe opaque identifier.");
    return new InquiryId(value);
  }
}
