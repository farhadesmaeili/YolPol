import {describe, expect, it} from "vitest";

import {formatInquiryCreatedNotification} from "@/features/inquiries/application/formatters/inquiry-notification-formatter";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

describe("inquiry notification formatter", () => {
  it("formats provider-neutral customer and requested-product details", () => {
    const inquiry = new InquiryTestBuilder().with({id: "inq-notification"}).buildNew();
    const message = formatInquiryCreatedNotification(inquiry);
    expect(message.subject).toBe("New inquiry inq-notification");
    expect(message.body).toContain("Inquiry: inq-notification");
    expect(message.body).toContain(`Customer: ${inquiry.contact.fullName}`);
    expect(message.body).toContain(`Company: ${inquiry.contact.company}`);
    expect(message.body).toContain(`${inquiry.items[0].productName} (${inquiry.items[0].sku}): ${inquiry.items[0].quantity} pallets`);
    expect(message.body).not.toMatch(/price|token|secret|credential/iu);
  });
});
