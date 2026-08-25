import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

export type StaffPrincipalResponse = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  displayName: string;
}>;

