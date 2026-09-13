import {describe, expect, it, vi} from "vitest";

import {CreateConversationAccess} from "@/features/inquiries/application/use-cases/create-conversation-access";

const token = `ypc_${"A".repeat(43)}`;

describe("CreateConversationAccess", () => {
  it("creates a persistable credential while returning the raw token only to the caller", () => {
    const issue = vi.fn(() => ({token, lookup: "b".repeat(64), hash: "a".repeat(64)}));
    const result = new CreateConversationAccess({issue, inspect: () => null, hashesMatch: () => false}).execute({conversationId: "conversation-1", createdAt: new Date("2026-08-25T10:00:00.000Z")});
    expect(result).toMatchObject({status: "created", token, credential: {tokenLookup: "b".repeat(64), tokenHash: "a".repeat(64)}});
    if (result.status === "created") expect(JSON.stringify(result.credential)).not.toContain(token);
  });

  it("fails closed when secure token generation fails", () => {
    const useCase = new CreateConversationAccess({issue: () => { throw new Error("random source secret"); }, inspect: () => null, hashesMatch: () => false});
    expect(useCase.execute({conversationId: "conversation-1", createdAt: new Date()})).toEqual({status: "dependency_failed"});
  });
});
