import {describe, expect, it} from "vitest";

import {NodeNotificationDestinationIdGenerator, NodeTelegramGroupTokenService} from "@/features/notification-destinations/infrastructure/security/telegram-group-token-service";

describe("Telegram group token security", () => {
  it("issues a 256-bit one-time credential and persists only separated digests", () => {
    const service = new NodeTelegramGroupTokenService(() => Buffer.alloc(32, 7), () => "00000000-0000-4000-8000-000000000001");
    const issued = service.issue();
    expect(issued.credential).toMatch(/^ypg_[A-Za-z0-9_-]{43}$/u);
    expect(issued.lookup).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.verification).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.lookup).not.toBe(issued.verification);
    expect(JSON.stringify({lookup: issued.lookup, verification: issued.verification})).not.toContain(issued.credential);
    expect(service.inspect(issued.credential)).toEqual({lookup: issued.lookup, verification: issued.verification});
    expect(service.inspect(`ypt_${"A".repeat(43)}`)).toBeNull();
  });

  it("uses bounded opaque recipient and event identifiers", () => {
    const ids = new NodeNotificationDestinationIdGenerator(() => "00000000-0000-4000-8000-000000000001");
    expect(ids.recipientId()).toBe("notification_recipient_00000000000040008000000000000001");
    expect(ids.eventId()).toBe("notification_event_00000000000040008000000000000001");
  });
});
