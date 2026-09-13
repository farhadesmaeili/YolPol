import type {StaffAccountRepository, StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {createStaffPrincipal} from "@/features/staff-authentication/application/use-cases/staff-principal-factory";

export class ResolveStaffConversationActor {
  constructor(
    private readonly accounts: StaffAccountRepository,
    private readonly authorization: StaffAuthorization,
  ) {}

  async execute(input: Readonly<{teamMemberId: string}>): Promise<string | null> {
    try {
      const record = await this.accounts.findAuthorizationByTeamMemberId(input.teamMemberId);
      if (!record || !record.staffAccountActive || !record.teamMemberActive) return null;
      const principal = createStaffPrincipal(record);
      return this.authorization.mayReplyToCustomerConversation(principal)
        ? this.authorization.actorReferenceFor(principal)
        : null;
    } catch {
      return null;
    }
  }
}
