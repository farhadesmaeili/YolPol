import {describe, expect, it, vi} from "vitest";

import {TelegramGroupConnectionCommandHandler} from "@/features/notification-destinations/infrastructure/communication/telegram/telegram-group-connection-command-handler";
import {TelegramStartCommandRouter} from "@/features/notification-destinations/infrastructure/communication/telegram/telegram-start-command-router";
import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";

const token = `ypg_${"A".repeat(43)}`;
const command = (overrides: Partial<TelegramStartCommand> = {}): TelegramStartCommand => ({externalUpdateId: "1", telegramUserId: "123", chatId: "-100999", chatType: "supergroup", chatTitle: "Operations", languageCode: "en", connectionToken: token, malformed: false, senderEligible: true, ...overrides});

describe("Telegram group connection command", () => {
  it("passes only Telegram-derived group and sender facts to consumption", async () => {
    const consume = {execute: vi.fn().mockResolvedValue({status: "authorized"})};
    const transport = {send: vi.fn().mockResolvedValue(undefined)};
    await new TelegramGroupConnectionCommandHandler(consume, transport).execute(command());
    expect(consume.execute).toHaveBeenCalledWith({connectionToken: token, telegramUserId: "123", groupChatId: "-100999", displayName: "Operations"});
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({chatId: "-100999", text: expect.stringContaining("authorized")}));
  });

  it.each([
    {chatType: "private"}, {chatType: "channel"}, {senderEligible: false}, {telegramUserId: null},
    {chatTitle: null}, {connectionToken: `ypg_${"!".repeat(43)}`}, {malformed: true},
  ])("rejects an invalid provider command without consuming it", async (override) => {
    const consume = {execute: vi.fn()};
    const transport = {send: vi.fn().mockResolvedValue(undefined)};
    await new TelegramGroupConnectionCommandHandler(consume, transport).execute(command(override));
    expect(consume.execute).not.toHaveBeenCalled();
  });

  it("routes only the ypg namespace to group authorization", async () => {
    const staff = {execute: vi.fn().mockResolvedValue(undefined)};
    const group = {execute: vi.fn().mockResolvedValue(undefined)};
    const router = new TelegramStartCommandRouter(staff, group);
    await router.execute(command());
    await router.execute(command({connectionToken: `ypt_${"A".repeat(43)}`}));
    expect(group.execute).toHaveBeenCalledTimes(1);
    expect(staff.execute).toHaveBeenCalledTimes(1);
  });
});
