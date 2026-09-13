import "server-only";

import {cache} from "react";
import {cookies} from "next/headers";

import {getTeamOperations} from "@/composition/inquiries/team-operations";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {staffSessionCookieName} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {resolveStaffPanelPrincipal, type StaffPanelAccess} from "@/features/staff-authentication/presentation/adapters/staff-panel-access";

export const resolveStaffPanelAccess = cache(async (): Promise<StaffPanelAccess> => {
  const credential = (await cookies()).get(staffSessionCookieName())?.value;
  if (!credential) return {status: "unauthorized"};
  try {
    return await resolveStaffPanelPrincipal(credential, getStaffAuthentication());
  } catch {
    return {status: "service_unavailable"};
  }
});

export function getStaffPanelTeamOperations() {
  return getTeamOperations();
}
