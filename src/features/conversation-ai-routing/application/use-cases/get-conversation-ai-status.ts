import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {ConversationAiRoutingRepository} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";

export class GetConversationAiStatus {
  constructor(private readonly repository: ConversationAiRoutingRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{inquiryId: string; principal: StaffPrincipal}>) {
    if (!this.authorization.mayViewCustomerConversation(input.principal)) return {status: "forbidden" as const};
    try {
      const value = await this.repository.readStatus(input.inquiryId);
      return value ? {status: "found" as const, value} : {status: "not_found" as const};
    } catch { return {status: "persistence_failed" as const}; }
  }
}
