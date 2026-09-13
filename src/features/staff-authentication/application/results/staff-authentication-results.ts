import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";

export type AuthenticateStaffResult =
  | Readonly<{status: "authenticated"; principal: StaffPrincipal; sessionCredential: string; expiresAt: Date}>
  | Readonly<{status: "authentication_failed"}>
  | Readonly<{status: "persistence_failed" | "dependency_failed"}>;

export type ResolveStaffSessionResult =
  | Readonly<{status: "authenticated"; principal: StaffPrincipal}>
  | Readonly<{status: "unauthorized"}>
  | Readonly<{status: "persistence_failed" | "dependency_failed"}>;

export type LogoutStaffResult = Readonly<{status: "completed" | "persistence_failed" | "dependency_failed"}>;

