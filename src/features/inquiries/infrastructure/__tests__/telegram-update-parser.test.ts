import {describe, expect, it} from "vitest";

import {classifyTelegramUpdate, parseTelegramUpdate} from "@/features/inquiries/infrastructure/communication/telegram/telegram-update-parser";

const update = () => ({
  update_id: 987654,
  message: {
    message_id: 45,
    from: {id: 456, is_bot: false, username: "mutable_name"},
    chat: {id: -100123, title: "YOLPOL team"},
    text: "  We can ship next week.  ",
    reply_to_message: {message_id: 44, text: "Copied text is not trusted for correlation"},
  },
});

describe("parseTelegramUpdate", () => {
  it("extracts stable numeric provider identifiers and the reply body", () => {
    expect(parseTelegramUpdate(update())).toEqual({
      externalUpdateId: "987654",
      externalMessageId: "-100123:45",
      externalRecipientId: "-100123",
      senderExternalId: "456",
      body: "We can ship next week.",
      repliedMessageId: "44",
    });
  });

  it("preserves documented 52-bit user and chat identifiers exactly", () => {
    const maximumTelegramId = 2 ** 52 - 1;
    expect(parseTelegramUpdate({...update(), message: {...update().message, from: {id: maximumTelegramId}, chat: {id: -maximumTelegramId}}})).toMatchObject({
      senderExternalId: String(maximumTelegramId),
      externalRecipientId: String(-maximumTelegramId),
    });
  });

  it.each([
    null,
    {},
    {...update(), update_id: -1},
    {...update(), message: {...update().message, text: " "}},
    {...update(), message: {...update().message, reply_to_message: undefined}},
    {...update(), message: {...update().message, reply_to_message: {message_id: 0}}},
    {...update(), message: {...update().message, from: {username: "name-only"}}},
  ])("rejects unsupported or uncorrelatable Telegram updates", (input) => expect(parseTelegramUpdate(input)).toBeNull());

  it.each([
    {update_id: 2, message: {message_id: 2, from: {id: 101}, chat: {id: 101}, text: "Hello"}},
    {update_id: 3, message: {message_id: 3, from: {id: 101}, chat: {id: -100123}, text: "Group chatter"}},
    {update_id: 4, callback_query: {id: "callback-1", from: {id: 101}}},
    {...update(), update_id: 5, message: {...update().message, reply_to_message: undefined}},
  ])("classifies valid non-actionable Telegram traffic as ignored", (input) => {
    expect(classifyTelegramUpdate(input)).toEqual({status: "ignored"});
  });

  it.each([
    ["plain private start", "/start", "private", null, false],
    ["private token", "/start ypt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "private", "ypt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", false],
    ["addressed group command", "/start@YolpolBot", "supergroup", null, false],
    ["malformed payload", "/start token extra", "private", null, true],
  ] as const)("classifies %s before inquiry replies", (_name, text, chatType, connectionToken, malformed) => {
    const input = {...update(), message: {...update().message, from: {id: 456, is_bot: false, language_code: "fa-IR"}, chat: {id: chatType === "private" ? 456 : -100123, type: chatType}, text}};
    expect(classifyTelegramUpdate(input)).toEqual({status: "staff_connection_start", command: {
      externalUpdateId: "987654", telegramUserId: "456", chatId: chatType === "private" ? "456" : "-100123",
      chatType, languageCode: "fa-IR", connectionToken, malformed, senderEligible: true,
    }});
  });

  it("never routes /start with reply_to_message into an inquiry conversation", () => {
    const input = {...update(), message: {...update().message, chat: {id: 456, type: "private"}, text: "/start ypt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}};
    expect(classifyTelegramUpdate(input).status).toBe("staff_connection_start");
  });

  it("classifies a supported correlated reply as actionable", () => {
    expect(classifyTelegramUpdate(update())).toEqual({status: "actionable", reply: parseTelegramUpdate(update())});
  });

  it.each([null, {}, {update_id: -1, message: {}}, {update_id: 1}, {update_id: 1, message: {}, callback_query: {}}])(
    "classifies structurally invalid update envelopes as invalid",
    (input) => expect(classifyTelegramUpdate(input)).toEqual({status: "invalid"}),
  );
});
