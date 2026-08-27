import {describe, expect, it} from "vitest";

import {formatCustomerConversationMessageCreatedNotification, formatInquiryCreatedNotification, telegramNotificationTextLimit} from "@/features/inquiries/application/formatters/inquiry-notification-formatter";
import {Message} from "@/features/inquiries/domain/entities/message";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

const staffUrl = "https://yolpol.com/en/staff/inquiries/inq-notification";

describe("Telegram inquiry notification formatter", () => {
  it("formats safe operational details and the authenticated Staff link as plain text", () => {
    const inquiry = new InquiryTestBuilder().with({id: "inq-notification", message: "First line\nStatus: customer supplied"}).buildNew();
    const text = formatInquiryCreatedNotification(inquiry, staffUrl).text;
    expect(text).toContain("Inquiry reference: inq-notification");
    expect(text).toContain(`Customer: ${inquiry.contact.fullName}`);
    expect(text).toContain("Location: TR, Istanbul");
    expect(text).toContain("Destination: AE, Dubai");
    expect(text).toContain(`${inquiry.items[0]!.productName} (${inquiry.items[0]!.sku}): 1 pallets`);
    expect(text).toContain("Customer message:\n  First line\n  Status: customer supplied");
    expect(text).toContain("Source locale: en");
    expect(text).toContain(`Staff panel: ${staffUrl}`);
    expect(text).not.toMatch(/parse_mode|<[^>]+>|\*\*/u);
  });

  it("removes unsafe directional controls while preserving Persian, Arabic, Turkish, and emoji", () => {
    const message = "\u0641\u0627\u0631\u0633\u06cc\u202e\n\u0627\u0644\u0639\u0631\u0628\u064a\u0629\nT\u00fcrk\u00e7e \ud83e\uddea\ud83d\ude9a";
    const text = formatInquiryCreatedNotification(new InquiryTestBuilder().with({message}).buildNew(), staffUrl).text;
    expect(text).toContain("\u0641\u0627\u0631\u0633\u06cc");
    expect(text).toContain("\u0627\u0644\u0639\u0631\u0628\u064a\u0629");
    expect(text).toContain("T\u00fcrk\u00e7e \ud83e\uddea\ud83d\ude9a");
    expect(text).not.toContain("\u202e");
  });

  it("truncates without splitting surrogate pairs and preserves routing context", () => {
    const items = Array.from({length: 60}, (_, index) => ({
      productId: `product-${index}`,
      sku: `SKU-${index}`,
      slug: `product-${index}`,
      productName: `\u0628\u0637\u0631\u06cc \u0634\u06cc\u0634\u0647 \ud83e\uddea ${index} ${"x".repeat(70)}`,
      quantity: index + 1,
      unit: "pallets" as const,
    }));
    const text = formatInquiryCreatedNotification(new InquiryTestBuilder().with({id: "unicode-long", items, message: "\ud83d\ude9a".repeat(1_000)}).buildNew(), "https://yolpol.com/en/staff/inquiries/unicode-long").text;
    expect(text.length).toBeLessThanOrEqual(telegramNotificationTextLimit);
    expect(text).toContain("Inquiry reference: unicode-long");
    expect(text).toContain("[content shortened for Telegram]");
    expect(text).toContain("Staff panel: https://yolpol.com/en/staff/inquiries/unicode-long");
    expect(text).not.toMatch(/[\uD800-\uDBFF]$/u);
  });

  it("contains none of the protected sentinel values", () => {
    const protectedValues = {
      internalUnitPrice: "9918273645-IRR-INTERNAL",
      cost: "COST-SENTINEL-9081",
      margin: "MARGIN-SENTINEL-7712",
      pricePerBottle: "PRICE-PER-BOTTLE-6613",
      conversationToken: `ypc_${"A".repeat(43)}`,
      staffSession: `yps_${"B".repeat(43)}`,
      botToken: "123456:BOT_SECRET_SENTINEL",
      webhookSecret: "WEBHOOK_SECRET_SENTINEL",
      databaseUrl: "postgresql://secret:secret@example.test/yolpol",
    } as const;
    const forbidden = Object.values(protectedValues);
    const detect = (value: string) => forbidden.filter((sentinel) => value.includes(sentinel));
    expect(detect(JSON.stringify(protectedValues))).toEqual(forbidden);
    expect(detect(formatInquiryCreatedNotification(new InquiryTestBuilder().buildNew(), staffUrl).text)).toEqual([]);
    const customerMessage = Message.create({
      id: "customer-message-confidentiality",
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      body: "Please confirm the delivery schedule.",
      createdAt: new Date("2026-08-27T08:00:00.000Z"),
    });
    expect(detect(formatCustomerConversationMessageCreatedNotification(
      new InquiryTestBuilder().buildNew(),
      "conversation-confidentiality",
      customerMessage,
      staffUrl,
    ).text)).toEqual([]);
  });

  it("clearly formats a subsequent customer message with safe operational context", () => {
    const inquiry = new InquiryTestBuilder().with({id: "inq-notification"}).buildNew();
    const message = Message.create({
      id: "customer-message-1",
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      body: "Please confirm the updated delivery date.",
      createdAt: new Date("2026-08-27T08:00:00.000Z"),
    });
    const text = formatCustomerConversationMessageCreatedNotification(inquiry, "conversation-1", message, staffUrl).text;

    expect(text).toContain("NEW CUSTOMER MESSAGE");
    expect(text).not.toContain("New YOLPOL inquiry");
    expect(text).toContain("Inquiry reference: inq-notification");
    expect(text).toContain("Conversation reference: conversation-1");
    expect(text).toContain("Message:\n  Please confirm the updated delivery date.");
    expect(text).toContain(`Staff panel: ${staffUrl}`);
    expect(text).not.toMatch(/parse_mode|<[^>]+>|\*\*/u);
  });

  it("truncates a subsequent customer message without losing its routing context", () => {
    const inquiry = new InquiryTestBuilder().with({id: "customer-message-long"}).buildNew();
    const message = Message.create({
      id: "customer-message-long-1",
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      body: "\ud83d\ude9a".repeat(5_000),
      createdAt: new Date("2026-08-27T08:00:00.000Z"),
    });
    const url = "https://yolpol.com/en/staff/inquiries/customer-message-long";
    const text = formatCustomerConversationMessageCreatedNotification(inquiry, "conversation-long", message, url).text;

    expect(text.length).toBeLessThanOrEqual(telegramNotificationTextLimit);
    expect(text).toContain("NEW CUSTOMER MESSAGE");
    expect(text).toContain("[content shortened for Telegram]");
    expect(text).toContain(`Staff panel: ${url}`);
    expect(text).not.toMatch(/[\uD800-\uDBFF]$/u);
  });
});
