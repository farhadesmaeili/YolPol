import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";

import {NodeTelegramConnectionTokenService} from "@/features/telegram-staff-onboarding/infrastructure/security/telegram-connection-token-service";

describe("NodeTelegramConnectionTokenService", () => {
  it("issues a 256-bit Telegram-specific credential once and persists only separated digests", () => {
    const random = vi.fn(() => Buffer.alloc(32, 7));
    const service = new NodeTelegramConnectionTokenService(random, () => "00000000-0000-4000-8000-000000000001");
    const issued = service.issue();
    expect(random).toHaveBeenCalledWith(32);
    expect(issued.credential).toMatch(/^ypt_[A-Za-z0-9_-]{43}$/u);
    expect(issued.credential).toHaveLength(47);
    expect(issued.lookup).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.verification).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.lookup).not.toBe(issued.verification);
    expect(issued).not.toHaveProperty("rawToken");
    expect(issued).not.toHaveProperty("invitationId");
    expect(issued.lookup).toBe(createHash("sha256").update(`yolpol:telegram-staff-connection:v1:lookup:${issued.credential}`).digest("hex"));
    expect(issued.verification).toBe(createHash("sha256").update(`yolpol:telegram-staff-connection:v1:verification:${issued.credential}`).digest("hex"));
  });

  it("strictly inspects tokens and performs fixed-length digest verification", () => {
    const service = new NodeTelegramConnectionTokenService(() => Buffer.alloc(32, 1), () => "00000000-0000-4000-8000-000000000001");
    const issued = service.issue();
    expect(service.inspect(issued.credential)).toEqual({lookup: issued.lookup, verification: issued.verification});
    for (const malformed of ["", `ypi_${"A".repeat(43)}`, `ypt_${"A".repeat(42)}`, `ypt_${"!".repeat(43)}`, `${issued.credential}x`]) {
      expect(service.inspect(malformed)).toBeNull();
    }
    expect(service.digestsMatch(issued.verification, issued.verification)).toBe(true);
    expect(service.digestsMatch(issued.lookup, issued.verification)).toBe(false);
    expect(service.digestsMatch("not-a-digest", issued.verification)).toBe(false);
  });
});
