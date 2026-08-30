import {describe, expect, it, vi} from "vitest";

import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";
import {TelegramStaffConnectionCommandHandler} from "@/features/telegram-staff-onboarding/infrastructure/communication/telegram/telegram-staff-connection-command-handler";

const token = `ypt_${"A".repeat(43)}`;
const command = (overrides: Partial<TelegramStartCommand> = {}): TelegramStartCommand => ({
  externalUpdateId: "1", telegramUserId: "456", chatId: "456", chatType: "private", languageCode: "en",
  connectionToken: token, malformed: false, senderEligible: true, ...overrides,
});

describe("TelegramStaffConnectionCommandHandler", () => {
  it("consumes a valid private-chat token before sending a safe localized confirmation", async () => {
    const events: string[] = [];
    const consume = {execute: vi.fn(async () => { events.push("consume"); return {status: "connected" as const}; })};
    const transport = {send: vi.fn(async ({text}: {text: string}) => { events.push("send"); expect(text).toBe("تلگرام با موفقیت متصل شد."); })};
    await new TelegramStaffConnectionCommandHandler(consume, transport).execute(command({languageCode: "fa-IR"}));
    expect(events).toEqual(["consume", "send"]);
    expect(consume.execute).toHaveBeenCalledWith({connectionToken: token, telegramUserId: "456", privateChatId: "456"});
  });

  it.each([
    ["a group command", {chatType: "supergroup"}],
    ["a bot sender", {senderEligible: false}],
    ["a malformed command", {malformed: true}],
    ["an invalid token", {connectionToken: "invalid"}],
  ] as const)("never consumes %s and returns the same neutral failure", async (_name, overrides) => {
    const consume = {execute: vi.fn()};
    const transport = {send: vi.fn().mockResolvedValue(undefined)};
    await new TelegramStaffConnectionCommandHandler(consume, transport).execute(command(overrides));
    expect(consume.execute).not.toHaveBeenCalled();
    expect(transport.send).toHaveBeenCalledWith({chatId: "456", text: "This connection link is invalid or expired. Create a new connection from the Staff Panel."});
  });

  it("answers plain /start neutrally without consulting Staff identity", async () => {
    const consume = {execute: vi.fn()};
    const transport = {send: vi.fn().mockResolvedValue(undefined)};
    await new TelegramStaffConnectionCommandHandler(consume, transport).execute(command({connectionToken: null, languageCode: "tr"}));
    expect(consume.execute).not.toHaveBeenCalled();
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({text: expect.stringContaining("YOLPOL")}));
  });

  it("keeps the committed link authoritative when confirmation delivery fails", async () => {
    let committed = false;
    const consume = {execute: vi.fn(async () => { committed = true; return {status: "connected" as const}; })};
    const transport = {send: vi.fn().mockRejectedValue(new Error("provider unavailable"))};
    await expect(new TelegramStaffConnectionCommandHandler(consume, transport).execute(command())).resolves.toBeUndefined();
    expect(committed).toBe(true);
  });

  it("does not create a duplicate link when Telegram redelivers the same consumed token", async () => {
    let attempts = 0;
    let links = 0;
    const consume = {execute: vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) { links += 1; return {status: "connected" as const}; }
      return {status: "unavailable" as const};
    })};
    const transport = {send: vi.fn().mockResolvedValue(undefined)};
    const handler = new TelegramStaffConnectionCommandHandler(consume, transport);
    await handler.execute(command());
    await handler.execute(command());
    expect(links).toBe(1);
    expect(transport.send).toHaveBeenNthCalledWith(1, expect.objectContaining({text: "Telegram connected successfully."}));
    expect(transport.send).toHaveBeenNthCalledWith(2, expect.objectContaining({text: expect.stringContaining("invalid or expired")}));
  });
});
