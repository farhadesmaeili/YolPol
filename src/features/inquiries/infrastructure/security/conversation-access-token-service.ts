import {createHash, randomBytes, timingSafeEqual} from "node:crypto";

import type {ConversationAccessTokenService, IssuedConversationAccessToken, PresentedConversationAccessToken} from "@/features/inquiries/application/ports/conversation-access-ports";

const tokenPattern = /^ypc_([A-Za-z0-9_-]{43})$/u;
type RandomBytes = (size: number) => Buffer;

function hashToken(purpose: "lookup" | "verify", token: string): string {
  return createHash("sha256").update(`${purpose}:${token}`, "utf8").digest("hex");
}

export class NodeConversationAccessTokenService implements ConversationAccessTokenService {
  constructor(private readonly secureRandomBytes: RandomBytes = randomBytes) {}

  issue(): IssuedConversationAccessToken {
    const secret = this.secureRandomBytes(32).toString("base64url");
    const token = `ypc_${secret}`;
    if (!tokenPattern.test(token)) throw new Error("Conversation access token generation failed.");
    return Object.freeze({token, lookup: hashToken("lookup", token), hash: hashToken("verify", token)});
  }

  inspect(token: string): PresentedConversationAccessToken | null {
    const match = tokenPattern.exec(token);
    return match?.[1] ? Object.freeze({lookup: hashToken("lookup", token), hash: hashToken("verify", token)}) : null;
  }

  hashesMatch(actualHash: string, expectedHash: string): boolean {
    if (!/^[a-f0-9]{64}$/u.test(actualHash) || !/^[a-f0-9]{64}$/u.test(expectedHash)) return false;
    return timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
  }
}
