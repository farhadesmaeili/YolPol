import "server-only";

import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {ActivateStaffInvitation} from "@/features/staff-authentication/application/use-cases/activate-staff-invitation";
import {CreateStaffInvitation} from "@/features/staff-authentication/application/use-cases/create-staff-invitation";
import {ListStaffTeam} from "@/features/staff-authentication/application/use-cases/list-staff-team";
import {ChangeStaffRole, SetStaffActive} from "@/features/staff-authentication/application/use-cases/manage-staff-account";
import {RevokeStaffInvitation} from "@/features/staff-authentication/application/use-cases/revoke-staff-invitation";
import {PostgresStaffManagementRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-management-repository";
import {NodeScryptPasswordHasher} from "@/features/staff-authentication/infrastructure/security/node-scrypt-password-hasher";
import {NodeStaffManagementIdGenerator} from "@/features/staff-authentication/infrastructure/security/node-staff-management-id-generator";
import {NodeStaffInvitationTokenService} from "@/features/staff-authentication/infrastructure/security/staff-invitation-token-service";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export type StaffManagement = Readonly<{
  activateInvitation: ActivateStaffInvitation;
  createInvitation: CreateStaffInvitation;
  listTeam: ListStaffTeam;
  changeRole: ChangeStaffRole;
  setActive: SetStaffActive;
  revokeInvitation: RevokeStaffInvitation;
  repository: PostgresStaffManagementRepository;
}>;

let management: StaffManagement | undefined;

export function getStaffManagement(): StaffManagement {
  if (management) return management;
  const repository = new PostgresStaffManagementRepository(getInquiryPostgresPool());
  const authentication = getStaffAuthentication();
  const clock = {now: () => new Date()};
  management = Object.freeze({
    activateInvitation: new ActivateStaffInvitation(repository, new NodeStaffInvitationTokenService(), new NodeScryptPasswordHasher(), new NodeStaffManagementIdGenerator(), authentication.authorization, clock),
    createInvitation: new CreateStaffInvitation(repository, new NodeStaffInvitationTokenService(), authentication.authorization, clock),
    listTeam: new ListStaffTeam(repository, authentication.authorization, clock),
    changeRole: new ChangeStaffRole(repository, authentication.authorization, clock),
    setActive: new SetStaffActive(repository, authentication.authorization, clock),
    revokeInvitation: new RevokeStaffInvitation(repository, authentication.authorization, clock),
    repository,
  });
  return management;
}
