import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {principalFromTelegramIdentity, type TelegramStaffIdentity} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";

export function mayUseOwnTelegram(authorization: StaffAuthorization, identity: TelegramStaffIdentity): boolean {
  return identity.accountActive
    && identity.teamMemberActive
    && authorization.mayAccessStaffPanel(principalFromTelegramIdentity(identity));
}

export function mayManageTargetTelegram(authorization: StaffAuthorization, actor: TelegramStaffIdentity, target: TelegramStaffIdentity): boolean {
  if (!actor.accountActive || !actor.teamMemberActive) return false;
  return authorization.mayDeactivateStaffMember(
    principalFromTelegramIdentity(actor),
    {staffAccountId: target.staffAccountId, role: target.role, active: target.accountActive && target.teamMemberActive},
  );
}
