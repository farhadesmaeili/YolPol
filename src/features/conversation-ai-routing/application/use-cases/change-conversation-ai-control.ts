import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {ChangeConversationAiControlInput} from "@/features/conversation-ai-routing/application/dto/conversation-ai-routing-dto";
import type {ConversationAiClock, ConversationAiControlEventIdGenerator, ConversationAiRoutingRepository} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import {conversationAiControlStates, type ConversationAiControlState} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export class ChangeConversationAiControl {
  constructor(
    private readonly repository: ConversationAiRoutingRepository,
    private readonly authorization: StaffAuthorization,
    private readonly eventIds: ConversationAiControlEventIdGenerator,
    private readonly clock: ConversationAiClock,
  ) {}

  async execute(input: ChangeConversationAiControlInput & Readonly<{principal: StaffPrincipal}>) {
    if (!this.authorization.mayControlConversationAi(input.principal)) return {status: "forbidden" as const};
    if (!(conversationAiControlStates as readonly unknown[]).includes(input.state)) return {status: "validation_failed" as const, field: "state" as const};
    if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) return {status: "validation_failed" as const, field: "expectedVersion" as const};
    let actorReference: string;
    try { actorReference = this.authorization.actorReferenceFor(input.principal); }
    catch { return {status: "dependency_failed" as const}; }
    if (input.actorReference !== actorReference) return {status: "forbidden" as const};
    try {
      const result = await this.repository.changeControl({
        inquiryId: input.inquiryId,
        state: input.state as ConversationAiControlState,
        expectedVersion: input.expectedVersion as number,
        actorReference,
        eventId: this.eventIds.generate(),
        now: this.clock.now(),
      });
      return result === "updated" || result === "unchanged"
        ? {status: "updated" as const, unchanged: result === "unchanged"}
        : {status: result as "not_found" | "conflict"};
    } catch { return {status: "persistence_failed" as const}; }
  }
}
