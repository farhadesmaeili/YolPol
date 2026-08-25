import {describe, expect, it} from "vitest";

import {parseTelegramUpdate} from "@/features/inquiries/infrastructure/communication/telegram/telegram-update-parser";

const update = (notification = "New inquiry\nInquiry #1234\nCustomer: Example") => ({
  update_id: 987654,
  message: {
    message_id: 45,
    from: {id: 456, is_bot: false},
    chat: {id: -100123},
    text: "  We can ship next week.  ",
    reply_to_message: {message_id: 44, text: notification},
  },
});

describe("parseTelegramUpdate", () => {
  it("extracts the sender, reply, original content, and inquiry ID", () => {
    expect(parseTelegramUpdate(update())).toEqual({
      externalUpdateId: "987654",
      externalMessageId: "-100123:45",
      externalRecipientId: "-100123",
      senderExternalId: "456",
      body: "We can ship next week.",
      repliedMessageBody: "New inquiry\nInquiry #1234\nCustomer: Example",
      inquiryId: "1234",
    });
  });

  it("keeps compatibility with the existing opaque inquiry notification line", () => {
    expect(parseTelegramUpdate(update("Inquiry: 9ca5dbdd-7049-4cee-a85b-c778ca617214"))?.inquiryId).toBe("9ca5dbdd-7049-4cee-a85b-c778ca617214");
  });

  it.each([
    null,
    {},
    {...update(), update_id: -1},
    {...update(), message: {...update().message, text: " "}},
    {...update(), message: {...update().message, reply_to_message: undefined}},
    update("Inquiry #one\nInquiry #two"),
    update("Customer mentioned Inquiry #1234 in prose."),
  ])("rejects unsupported or ambiguous Telegram updates", (input) => {
    expect(parseTelegramUpdate(input)).toBeNull();
  });
});
