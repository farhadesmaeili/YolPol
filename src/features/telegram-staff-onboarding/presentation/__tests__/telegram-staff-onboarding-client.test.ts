import {describe, expect, it, vi} from "vitest";

import {createOwnTelegramConnectionRequest, readOwnTelegramConnection} from "@/features/telegram-staff-onboarding/presentation/clients/telegram-staff-onboarding-client";

const token = `ypt_${"A".repeat(43)}`;

describe("Telegram Staff onboarding browser client", () => {
  it("keeps only the one-time deep link and expiry in component-facing memory", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({status: "created", connectionToken: token, deepLink: `https://t.me/YolpolBot?start=${token}`, expiresAt: "2026-08-30T12:10:00.000Z"}, {status: 201}));
    const result = await createOwnTelegramConnectionRequest(fetcher);
    expect(result).toEqual({deepLink: `https://t.me/YolpolBot?start=${token}`, expiresAt: "2026-08-30T12:10:00.000Z"});
    expect(result).not.toHaveProperty("connectionToken");
    expect(fetcher).toHaveBeenCalledWith("/api/staff/telegram/connection-request", expect.objectContaining({body: "{}"}));
  });

  it.each([
    `http://t.me/YolpolBot?start=${token}`,
    `https://attacker.example/YolpolBot?start=${token}`,
    `https://t.me/not-a-bot?start=${token}`,
    `https://t.me/YolpolBot?start=${token}&next=https://attacker.example`,
  ])("rejects unsafe deep link %s", async (deepLink) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({status: "created", connectionToken: token, deepLink, expiresAt: "2026-08-30T12:10:00.000Z"}, {status: 201}));
    await expect(createOwnTelegramConnectionRequest(fetcher)).resolves.toBeNull();
  });

  it("accepts only safe own status DTOs", async () => {
    await expect(readOwnTelegramConnection(vi.fn().mockResolvedValue(Response.json({connection: {status: "CONNECTED", telegramUserId: "123"}})))).resolves.toEqual({status: "CONNECTED"});
    await expect(readOwnTelegramConnection(vi.fn().mockResolvedValue(Response.json({connection: {status: "PENDING"}})))).resolves.toBeNull();
  });
});
