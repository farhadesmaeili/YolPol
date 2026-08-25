import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

export type StaffPrincipal = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  displayName: string;
  actorReference: string;
}>;

