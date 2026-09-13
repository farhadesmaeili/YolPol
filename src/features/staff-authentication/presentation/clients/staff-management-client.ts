import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function request(fetcher: Fetcher, url: string, init: RequestInit): Promise<"completed" | "failed"> {
  try { return (await fetcher(url, init)).ok ? "completed" : "failed"; }
  catch { return "failed"; }
}

export async function createStaffInvitation(fetcher: Fetcher, input: Readonly<{displayName: string; email: string; targetRole: StaffRole}>): Promise<Readonly<{status: "created"; activationCode: string; expiresAt: string}> | Readonly<{status: "failed"}>> {
  try {
    const response = await fetcher("/api/staff/team/invitations", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
    if (!response.ok) return {status: "failed"};
    const body = await response.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) return {status: "failed"};
    const record = body as Record<string, unknown>;
    return record.status === "created" && typeof record.activationCode === "string" && typeof record.expiresAt === "string"
      ? {status: "created", activationCode: record.activationCode, expiresAt: record.expiresAt}
      : {status: "failed"};
  } catch { return {status: "failed"}; }
}

export const changeStaffRole = (fetcher: Fetcher, accountId: string, role: StaffRole) => request(fetcher, `/api/staff/team/accounts/${encodeURIComponent(accountId)}/role`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({role})});
export const setStaffActive = (fetcher: Fetcher, accountId: string, active: boolean) => request(fetcher, `/api/staff/team/accounts/${encodeURIComponent(accountId)}/${active ? "reactivate" : "deactivate"}`, {method: "POST"});
export const revokeStaffInvitation = (fetcher: Fetcher, invitationId: string) => request(fetcher, `/api/staff/team/invitations/${encodeURIComponent(invitationId)}/revoke`, {method: "POST"});

export async function activateStaffInvitation(fetcher: Fetcher, input: Readonly<{email: string; activationCode: string; password: string}>): Promise<"activated" | "invalid_password" | "invitation_unavailable" | "failed"> {
  try {
    const response = await fetcher("/api/staff/activation", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
    if (response.status === 201) return "activated";
    const body = await response.json() as unknown;
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      const code = (body as Record<string, unknown>).code;
      if (code === "invalid_password" || code === "invitation_unavailable") return code;
    }
    return "failed";
  } catch { return "failed"; }
}
