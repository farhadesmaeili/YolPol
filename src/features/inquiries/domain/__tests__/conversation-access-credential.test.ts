import {describe, expect, it} from "vitest";

import {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

const valid = {
  conversationId: "conversation-1",
  tokenLookup: "b".repeat(64),
  tokenHash: "a".repeat(64),
  createdAt: new Date("2026-08-25T10:00:00.000Z"),
};

describe("ConversationAccessCredential", () => {
  it("models a hashed credential without retaining a raw token", () => {
    const credential = ConversationAccessCredential.create(valid);
    expect(credential).toMatchObject({tokenLookup: valid.tokenLookup, tokenHash: valid.tokenHash});
    expect(Object.keys(credential)).not.toContain("token");
  });

  it.each([
    [{...valid, tokenLookup: "short"}, "tokenLookup"],
    [{...valid, tokenHash: "A".repeat(64)}, "tokenHash"],
    [{...valid, createdAt: new Date(Number.NaN)}, "createdAt"],
    [{...valid, expiresAt: valid.createdAt}, "expiresAt"],
  ] as const)("rejects malformed credential data", (input, field) => {
    expect(() => ConversationAccessCredential.create(input)).toThrowError(expect.objectContaining<Partial<ConversationValidationError>>({field}));
  });
});
