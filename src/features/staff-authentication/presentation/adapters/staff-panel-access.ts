import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {StaffCapabilities} from "@/features/staff-authentication/application/dto/staff-capabilities";

export type StaffPanelAccess =
  | Readonly<{status: "authorized"; principal: StaffPrincipal; capabilities: StaffCapabilities}>
  | Readonly<{status: "unauthorized" | "forbidden" | "service_unavailable"}>;

type StaffPanelAuthentication = Readonly<{
  resolveSession: Readonly<{
    execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>;
  }>;
  authorization: Readonly<{
    mayAccessStaffPanel(principal: StaffPrincipal): boolean;
    capabilitiesFor(principal: StaffPrincipal): StaffCapabilities;
  }>;
}>;

export async function resolveStaffPanelPrincipal(
  sessionCredential: string | null | undefined,
  authentication: StaffPanelAuthentication,
): Promise<StaffPanelAccess> {
  if (!sessionCredential) return {status: "unauthorized"};
  try {
    const result = await authentication.resolveSession.execute({sessionCredential});
    if (result.status === "unauthorized") return {status: "unauthorized"};
    if (result.status !== "authenticated") return {status: "service_unavailable"};
    if (!authentication.authorization.mayAccessStaffPanel(result.principal)) return {status: "forbidden"};
    return Object.freeze({status: "authorized", principal: result.principal, capabilities: authentication.authorization.capabilitiesFor(result.principal)});
  } catch {
    return {status: "service_unavailable"};
  }
}
