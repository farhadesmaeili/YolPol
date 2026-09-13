import type {ConversationAccessRepository, ConversationAccessTokenService} from "@/features/inquiries/application/ports/conversation-access-ports";
import type {Clock} from "@/features/inquiries/application/ports/inquiry-ports";
import type {ResolveConversationByAccessTokenResult} from "@/features/inquiries/application/results/resolve-conversation-by-access-token-result";

const nonMatchingHash = "0".repeat(64);

export class ResolveConversationByAccessToken {
  constructor(
    private readonly access: ConversationAccessRepository,
    private readonly tokens: ConversationAccessTokenService,
    private readonly clock: Clock,
  ) {}

  async execute(input: Readonly<{token: string}>): Promise<ResolveConversationByAccessTokenResult> {
    const presented = this.tokens.inspect(input.token);
    if (!presented) return {status: "unauthorized"};

    let stored: Awaited<ReturnType<ConversationAccessRepository["findByLookup"]>>;
    try { stored = await this.access.findByLookup(presented.lookup); }
    catch { return {status: "persistence_failed"}; }

    const expectedHash = stored?.credential.tokenHash ?? nonMatchingHash;
    if (!this.tokens.hashesMatch(presented.hash, expectedHash) || !stored) return {status: "unauthorized"};

    let now: Date;
    try {
      const value: unknown = this.clock.now();
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return {status: "dependency_failed"};
      now = value;
    } catch { return {status: "dependency_failed"}; }

    const expiresAt = stored.credential.expiresAt;
    if (expiresAt && now >= expiresAt) return {status: "unauthorized"};
    return {status: "resolved", conversationId: stored.credential.conversationId.value, inquiryId: stored.inquiryId};
  }
}
