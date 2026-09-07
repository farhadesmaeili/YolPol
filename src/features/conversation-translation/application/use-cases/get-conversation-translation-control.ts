import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

export class GetConversationTranslationControl {
  constructor(private readonly repository: ConversationTranslationControlRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{inquiryId: string; principal: StaffPrincipal}>) {
    if (!this.authorization.mayViewCustomerConversation(input.principal)) return {status: "forbidden" as const};
    if (!/^[A-Za-z0-9_-]{1,160}$/u.test(input.inquiryId)) return {status: "validation_failed" as const};
    try {
      const value = await this.repository.read(input.inquiryId);
      return value ? {status: "found" as const, value} : {status: "not_found" as const};
    } catch { return {status: "persistence_failed" as const}; }
  }
}
