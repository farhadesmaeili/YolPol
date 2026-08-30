import {describe, expect, it} from "vitest";

import {buildTelegramStartDeepLink, parsePublicTelegramBotUsername, readPublicTelegramBotConfig} from "@/shared/config/telegram-bot";

describe("public Telegram bot configuration", () => {
  it("accepts only Telegram bot usernames and builds a fixed-host deep link", () => {
    expect(parsePublicTelegramBotUsername("YolPolStaffBot")).toBe("YolPolStaffBot");
    expect(readPublicTelegramBotConfig({NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "YolPolStaffBot"})).toEqual({username: "YolPolStaffBot"});
    expect(buildTelegramStartDeepLink("YolPolStaffBot", `ypt_${"A".repeat(43)}`)).toBe(`https://t.me/YolPolStaffBot?start=ypt_${"A".repeat(43)}`);
  });

  it.each([undefined, "", " yolpol_bot", "yolpol", "https://t.me/yolpolbot", "aBot", "bad-name-bot", "a".repeat(33)])("rejects invalid usernames", (value) => {
    expect(() => parsePublicTelegramBotUsername(value)).toThrow();
  });

  it("rejects arbitrary deep-link credentials", () => {
    expect(() => buildTelegramStartDeepLink("YolPolStaffBot", "not-a-token")).toThrow();
  });
});
