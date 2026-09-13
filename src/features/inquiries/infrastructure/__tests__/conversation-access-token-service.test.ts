import {describe, expect, it} from "vitest";

import {NodeConversationAccessTokenService} from "@/features/inquiries/infrastructure/security/conversation-access-token-service";

describe("NodeConversationAccessTokenService", () => {
  it("generates a cryptographically shaped opaque token and stores only its hash material", () => {
    const bytes = [Buffer.alloc(32, 2)];
    const service = new NodeConversationAccessTokenService((size) => {
      const next = bytes.shift();
      if (!next || next.length !== size) throw new Error("Unexpected random request.");
      return next;
    });
    const issued = service.issue();
    expect(issued.token).toMatch(/^ypc_[A-Za-z0-9_-]{43}$/u);
    expect(issued.lookup).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(issued.hash).not.toContain(issued.token);
    expect(service.inspect(issued.token)).toEqual({lookup: issued.lookup, hash: issued.hash});
    expect(service.hashesMatch(service.inspect(issued.token)!.hash, issued.hash)).toBe(true);
  });

  it("rejects malformed and modified tokens", () => {
    const service = new NodeConversationAccessTokenService();
    const issued = service.issue();
    const modified = `${issued.token.slice(0, -1)}${issued.token.endsWith("A") ? "B" : "A"}`;
    expect(service.inspect("invalid/token")).toBeNull();
    expect(service.hashesMatch(service.inspect(modified)!.hash, issued.hash)).toBe(false);
  });
});
