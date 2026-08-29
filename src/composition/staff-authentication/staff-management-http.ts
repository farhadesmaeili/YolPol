import "server-only";

import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getStaffAuthHttpOptions} from "@/composition/staff-authentication/staff-authentication-http";
import {getStaffManagement} from "@/composition/staff-authentication/staff-management";
import {
  createStaffActivationRequestHandler,
  createStaffActiveChangeRequestHandler,
  createStaffInvitationRequestHandler,
  createStaffInvitationRevocationRequestHandler,
  createStaffRoleChangeRequestHandler,
  createStaffTeamRequestHandler,
} from "@/features/staff-authentication/infrastructure/http/staff-management-request-handlers";

const options = getStaffAuthHttpOptions();

export const handleStaffTeam = createStaffTeamRequestHandler(getStaffAuthentication, getStaffManagement, options);
export const handleCreateStaffInvitation = createStaffInvitationRequestHandler(getStaffAuthentication, getStaffManagement, options);
export const handleRevokeStaffInvitation = createStaffInvitationRevocationRequestHandler(getStaffAuthentication, getStaffManagement, options);
export const handleChangeStaffRole = createStaffRoleChangeRequestHandler(getStaffAuthentication, getStaffManagement, options);
export const handleDeactivateStaff = createStaffActiveChangeRequestHandler(false, getStaffAuthentication, getStaffManagement, options);
export const handleReactivateStaff = createStaffActiveChangeRequestHandler(true, getStaffAuthentication, getStaffManagement, options);
export const handleActivateStaffInvitation = createStaffActivationRequestHandler(getStaffManagement, options);
