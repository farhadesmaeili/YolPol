import {describe, expect, it} from "vitest";

import {TelegramGroupConnectionRequest} from "@/features/notification-destinations/domain/entities/telegram-group-connection-request";
import {parseTelegramGroupDisplayName, TelegramGroupChatId} from "@/features/notification-destinations/domain/value-objects/telegram-group";

describe("notification destination domain", () => {
  it("accepts safe group identifiers and request state", () => {
    expect(TelegramGroupChatId.create("-1001234567890").value).toBe("-1001234567890");
    expect(parseTelegramGroupDisplayName("YOLPOL Operations")).toBe("YOLPOL Operations");
    expect(TelegramGroupConnectionRequest.create({id: "request-1", staffAccountId: "account-1", teamMemberId: "member-1", tokenLookup: "a".repeat(64), tokenVerification: "b".repeat(64), createdAt: new Date(0), expiresAt: new Date(1)}).id).toBe("request-1");
  });

  it.each(["123", "0", "-0", "-9007199254740992", "group-id"])("rejects unsafe group Chat ID %s", (value) => {
    expect(() => TelegramGroupChatId.create(value)).toThrow(/Chat ID/u);
  });

  it("rejects blank, padded, or oversized Telegram group titles", () => {
    for (const value of ["", " Group", "G".repeat(121)]) expect(() => parseTelegramGroupDisplayName(value)).toThrow(/display name/u);
  });
});
