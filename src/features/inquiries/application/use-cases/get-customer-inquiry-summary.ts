import type {CustomerInquirySummaryDto} from "@/features/inquiries/application/dto/customer-inquiry-summary-dto";
import type {InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";

export class GetCustomerInquirySummary {
  constructor(private readonly repository: Pick<InquiryRepository, "findById">) {}

  async execute(input: Readonly<{inquiryId: string}>): Promise<CustomerInquirySummaryDto | null> {
    const inquiry = await this.repository.findById(input.inquiryId);
    if (!inquiry) return null;
    // Explicit Customer projection: never spread the aggregate or operational DTOs.
    return {
      createdAt: inquiry.createdAt.toISOString(),
      items: inquiry.items.map(({productId, productName, quantity, unit}) => ({productId, name: productName, quantity, unit})),
      destination: inquiry.destination ? {country: inquiry.destination.country, city: inquiry.destination.city} : null,
      details: inquiry.message ?? null,
      initialMessageId: inquiry.message ? `${inquiry.id.value}-initial` : null,
    };
  }
}
