import type {TranslationRemediationRepository} from "@/features/conversation-translation/application/ports/translation-remediation-repository";
import {parseTranslationRemediation} from "@/features/conversation-translation/domain/types/translation-remediation";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

export class RemediateTranslation {
  constructor(private readonly repository: TranslationRemediationRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{inquiryId: string; messageId: string; principal: StaffPrincipal; payload: unknown}>) {
    if (!this.authorization.mayReplyToCustomerConversation(input.principal)) return {status: "forbidden"} as const;
    const payload = parseTranslationRemediation(input.payload);
    if (!payload || !/^[A-Za-z0-9_-]{1,160}$/u.test(input.inquiryId) || !/^[A-Za-z0-9_-]{1,160}$/u.test(input.messageId)) return {status: "validation_failed"} as const;
    try {
      return {status: await this.repository.remediate({...payload, inquiryId: input.inquiryId, messageId: input.messageId,
        actorReference: this.authorization.actorReferenceFor(input.principal)})};
    } catch { return {status: "persistence_failed"} as const; }
  }
}
