import {describe, expect, it} from "vitest";
import {GetCustomerInquirySummary} from "@/features/inquiries/application/use-cases/get-customer-inquiry-summary";
import {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import {inquiryFixture} from "@/features/inquiries/testing/fixtures/inquiry-fixtures";

describe("Customer inquiry summary", () => {
  it("projects only submitted Customer context with exact quantities and initial identity", async () => {
    const inquiry = Inquiry.create(inquiryFixture);
    const result = await new GetCustomerInquirySummary({findById: async () => inquiry}).execute({inquiryId: inquiry.id.value});
    expect(result).toEqual({createdAt: inquiryFixture.createdAt.toISOString(), items: [{productId: "test-product-1", name: "Test Bottle", quantity: 1, unit: "pallets"}], destination: {country: "AE", city: "Dubai"}, details: "Test message", initialMessageId: "test-inquiry-1-initial"});
    expect(JSON.stringify(result)).not.toMatch(/email|phone|status|privacy|price|supplier|margin|actor/i);
  });
  it("supports missing notes and destination without inventing context", async () => {
    const inquiry = Inquiry.create({...inquiryFixture, message: undefined, destination: undefined});
    expect(await new GetCustomerInquirySummary({findById: async () => inquiry}).execute({inquiryId: inquiry.id.value})).toMatchObject({details: null, initialMessageId: null, destination: null});
  });
  it("returns no summary for a missing inquiry", async () => {
    expect(await new GetCustomerInquirySummary({findById: async () => null}).execute({inquiryId: "missing"})).toBeNull();
  });
});
