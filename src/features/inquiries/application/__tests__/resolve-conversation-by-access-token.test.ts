import {describe, expect, it, vi} from "vitest";

import type {ConversationAccessRepository, ConversationAccessTokenService} from "@/features/inquiries/application/ports/conversation-access-ports";
import {ResolveConversationByAccessToken} from "@/features/inquiries/application/use-cases/resolve-conversation-by-access-token";
import {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";

const token = `ypc_${"A".repeat(43)}`;
const lookup = "b".repeat(64);
const hash = "a".repeat(64);
const createdAt = new Date("2026-08-25T10:00:00.000Z");
const credential = (expiresAt?: Date) => ConversationAccessCredential.create({conversationId: "conversation-1", tokenLookup: lookup, tokenHash: hash, createdAt, expiresAt});

function setup(stored: Awaited<ReturnType<ConversationAccessRepository["findByLookup"]>> = {credential: credential(), inquiryId: "inquiry-1"}) {
  const findByLookup = vi.fn().mockResolvedValue(stored);
  const hashesMatch = vi.fn((actual: string, expected: string) => actual === expected);
  const tokens: ConversationAccessTokenService = {issue: vi.fn(), inspect: vi.fn(() => ({lookup, hash})), hashesMatch};
  const useCase = new ResolveConversationByAccessToken({findByLookup}, tokens, {now: () => new Date("2026-08-25T11:00:00.000Z")});
  return {useCase, findByLookup, hashesMatch, tokens};
}

describe("ResolveConversationByAccessToken", () => {
  it("resolves a valid token to the existing conversation", async () => {
    const {useCase, findByLookup} = setup();
    await expect(useCase.execute({token})).resolves.toEqual({status: "resolved", conversationId: "conversation-1", inquiryId: "inquiry-1"});
    expect(findByLookup).toHaveBeenCalledWith(lookup);
  });

  it("rejects malformed and mismatched tokens", async () => {
    const malformed = setup();
    vi.mocked(malformed.tokens.inspect).mockReturnValue(null);
    await expect(malformed.useCase.execute({token: "bad/token"})).resolves.toEqual({status: "unauthorized"});
    expect(malformed.findByLookup).not.toHaveBeenCalled();
    const mismatched = setup();
    mismatched.hashesMatch.mockReturnValue(false);
    await expect(mismatched.useCase.execute({token})).resolves.toEqual({status: "unauthorized"});
  });

  it("performs a constant-time hash comparison even when the lookup is unknown", async () => {
    const {useCase, hashesMatch} = setup(null);
    await expect(useCase.execute({token})).resolves.toEqual({status: "unauthorized"});
    expect(hashesMatch).toHaveBeenCalledWith(hash, "0".repeat(64));
  });

  it("rejects an expired credential without distinguishing it from other invalid access", async () => {
    const {useCase} = setup({credential: credential(new Date("2026-08-25T10:30:00.000Z")), inquiryId: "inquiry-1"});
    await expect(useCase.execute({token})).resolves.toEqual({status: "unauthorized"});
  });
});
