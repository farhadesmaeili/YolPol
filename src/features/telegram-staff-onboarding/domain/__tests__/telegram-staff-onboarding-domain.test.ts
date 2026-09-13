import {describe, expect, it} from "vitest";

import {TelegramConnectionRequest} from "@/features/telegram-staff-onboarding/domain/entities/telegram-connection-request";
import {TelegramStaffLink} from "@/features/telegram-staff-onboarding/domain/entities/telegram-staff-link";
import {TelegramPrivateChatId, TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

const first = new Date("2026-08-30T08:00:00.000Z");
const later = new Date("2026-08-30T08:01:00.000Z");

describe("Telegram Staff onboarding domain", () => {
  it("represents Telegram identifiers as safe positive bigint decimal strings", () => {
    const beyondSafeInteger = "9007199254740993";
    expect(TelegramUserId.create(beyondSafeInteger).value).toBe(beyondSafeInteger);
    expect(TelegramPrivateChatId.create("9223372036854775807").value).toBe("9223372036854775807");
    for (const invalid of [0, "0", "-1", "+1", "01", "1.0", "9223372036854775808", "abc", undefined]) {
      expect(() => TelegramUserId.create(invalid)).toThrow();
      expect(() => TelegramPrivateChatId.create(invalid)).toThrow();
    }
  });

  it("models connected, disconnected, and same-identity reconnect lifecycle", () => {
    const connected = TelegramStaffLink.create({
      id: "link-1", teamMemberId: "member-1", telegramUserId: "1234567890123456", privateChatId: "333",
      firstLinkedAt: first, connectedAt: first, updatedAt: first,
    });
    expect(connected.connected).toBe(true);
    const disconnected = connected.disconnect(later);
    expect(disconnected.connected).toBe(false);
    const reconnectedAt = new Date("2026-08-30T08:02:00.000Z");
    const reconnected = disconnected.reconnect("444", reconnectedAt);
    expect(reconnected.connected).toBe(true);
    expect(reconnected.telegramUserId.value).toBe(connected.telegramUserId.value);
    expect(reconnected.privateChatId.value).toBe("444");
    expect(reconnected.firstLinkedAt).toEqual(first);
    expect(() => connected.reconnect("444", later)).toThrow();
    expect(() => disconnected.disconnect(reconnectedAt)).toThrow();
  });

  it("rejects invalid link lifecycle combinations", () => {
    expect(() => TelegramStaffLink.reconstitute({
      id: "link-1", teamMemberId: "member-1", telegramUserId: "1", privateChatId: "2",
      firstLinkedAt: later, connectedAt: first, updatedAt: later,
    })).toThrow();
    expect(() => TelegramStaffLink.reconstitute({
      id: "link-1", teamMemberId: "member-1", telegramUserId: "1", privateChatId: "2",
      firstLinkedAt: first, connectedAt: first, disconnectedAt: later, updatedAt: first,
    })).toThrow();
  });

  it("enforces request expiry and mutually exclusive terminal states", () => {
    const request = TelegramConnectionRequest.create({
      id: "request-1", staffAccountId: "account-1", teamMemberId: "member-1",
      tokenLookup: "a".repeat(64), tokenVerification: "b".repeat(64), createdAt: first, expiresAt: later,
    });
    expect(request.isAvailable(first)).toBe(true);
    expect(request.isAvailable(later)).toBe(false);
    expect(() => TelegramConnectionRequest.reconstitute({...request, createdAt: request.createdAt, expiresAt: request.expiresAt, consumedAt: later, revokedAt: later})).toThrow();
    expect(() => TelegramConnectionRequest.create({...request, createdAt: later, expiresAt: first})).toThrow();
    expect(() => TelegramConnectionRequest.create({...request, tokenVerification: request.tokenLookup, createdAt: first, expiresAt: later})).toThrow();
  });
});
