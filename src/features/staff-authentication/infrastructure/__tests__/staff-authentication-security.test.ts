import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

import {NodeScryptPasswordHasher, staffAuthenticationDummyPasswordHash} from "@/features/staff-authentication/infrastructure/security/node-scrypt-password-hasher";
import {NodeStaffSessionTokenService} from "@/features/staff-authentication/infrastructure/security/staff-session-token-service";

describe("NodeScryptPasswordHasher", () => {
  it("hashes and verifies with unique salts and production parameters", async () => {
    const hasher = new NodeScryptPasswordHasher();
    const first = await hasher.hash("correct horse battery staple");
    const second = await hasher.hash("correct horse battery staple");
    expect(first).toMatch(/^\$yolpol-scrypt\$v=1\$ln=17,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/u);
    expect(second).not.toBe(first);
    await expect(hasher.verify("correct horse battery staple", first)).resolves.toBe(true);
    await expect(hasher.verify("wrong password", first)).resolves.toBe(false);
    await expect(hasher.verify("anything", staffAuthenticationDummyPasswordHash)).resolves.toBe(false);
  }, 30_000);

  it.each([
    "",
    "$yolpol-scrypt$v=2$ln=17,r=8,p=1$eW9scG9sLXN0YWZmLWR1bQ$bdLNpYdn4w08WTMZ0RkwpcmiqmJ4RcrFwhhMXFozYSc",
    "$yolpol-scrypt$v=1$ln=16,r=8,p=1$eW9scG9sLXN0YWZmLWR1bQ$bdLNpYdn4w08WTMZ0RkwpcmiqmJ4RcrFwhhMXFozYSc",
    "$yolpol-scrypt$v=1$ln=17,r=8,p=1$invalid$invalid",
  ])("fails safely for malformed or unsupported stored hash %s", async (storedHash) => {
    await expect(new NodeScryptPasswordHasher().verify("password", storedHash)).resolves.toBe(false);
  });

  it("uses the platform constant-time comparison for the final derived keys", async () => {
    const source = await readFile("src/features/staff-authentication/infrastructure/security/node-scrypt-password-hasher.ts", "utf8");
    expect(source).toContain("timingSafeEqual(actual, parsed.derivedKey)");
  });
});

describe("NodeStaffSessionTokenService", () => {
  it("issues a 256-bit staff-specific credential and stores only domain-separated digests", () => {
    const randomValues = [Buffer.alloc(32, 7), Buffer.alloc(16, 8)];
    const service = new NodeStaffSessionTokenService((size) => {
      const next = randomValues.shift();
      if (!next || next.length !== size) throw new Error("Unexpected random request.");
      return next;
    });
    const issued = service.issue();
    expect(issued.credential).toMatch(/^yps_[A-Za-z0-9_-]{43}$/u);
    expect(issued.credential).not.toMatch(/^ypc_/u);
    expect(issued.lookup).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.verification).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.lookup).not.toBe(issued.verification);
    expect(service.inspect(issued.credential)).toEqual({lookup: issued.lookup, verification: issued.verification});
    expect(service.digestsMatch(service.inspect(issued.credential)!.verification, issued.verification)).toBe(true);
  });

  it("rejects customer, malformed, and modified credentials", () => {
    const service = new NodeStaffSessionTokenService();
    const issued = service.issue();
    const modified = `${issued.credential.slice(0, -1)}${issued.credential.endsWith("A") ? "B" : "A"}`;
    expect(service.inspect(`ypc_${"A".repeat(43)}`)).toBeNull();
    expect(service.inspect("invalid/token")).toBeNull();
    expect(service.digestsMatch(service.inspect(modified)!.verification, issued.verification)).toBe(false);
  });
});

