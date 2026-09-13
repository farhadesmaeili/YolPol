import type {TelegramConnectionViewModel} from "@/features/telegram-staff-onboarding/presentation/view-models/telegram-connection-view-model";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function connection(value: unknown): TelegramConnectionViewModel | null {
  const input = record(value);
  if (input?.status === "CONNECTED" || input?.status === "NOT_CONNECTED") return {status: input.status};
  return input?.status === "PENDING" && typeof input.pendingExpiresAt === "string"
    ? {status: "PENDING", pendingExpiresAt: input.pendingExpiresAt}
    : null;
}

export async function readOwnTelegramConnection(fetcher: Fetcher): Promise<TelegramConnectionViewModel | null> {
  try {
    const response = await fetcher("/api/staff/telegram", {cache: "no-store"});
    if (!response.ok) return null;
    return connection(record(await response.json())?.connection);
  } catch { return null; }
}

export async function createOwnTelegramConnectionRequest(fetcher: Fetcher): Promise<Readonly<{deepLink: string; expiresAt: string}> | null> {
  try {
    const response = await fetcher("/api/staff/telegram/connection-request", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: "{}",
    });
    if (!response.ok) return null;
    const body = record(await response.json());
    if (body?.status !== "created" || typeof body.connectionToken !== "string" || !/^ypt_[A-Za-z0-9_-]{43}$/u.test(body.connectionToken)
      || typeof body.deepLink !== "string" || typeof body.expiresAt !== "string") return null;
    const deepLink = new URL(body.deepLink);
    if (deepLink.protocol !== "https:" || deepLink.hostname !== "t.me" || deepLink.username || deepLink.password
      || !/^\/[A-Za-z][A-Za-z0-9_]{1,28}[Bb][Oo][Tt]$/u.test(deepLink.pathname)
      || deepLink.hash || deepLink.searchParams.get("start") !== body.connectionToken || [...deepLink.searchParams.keys()].join() !== "start") return null;
    return Object.freeze({deepLink: deepLink.toString(), expiresAt: body.expiresAt});
  } catch { return null; }
}

async function emptyMutation(fetcher: Fetcher, url: string): Promise<boolean> {
  try {
    return (await fetcher(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"})).ok;
  } catch { return false; }
}

export const disconnectOwnTelegram = (fetcher: Fetcher) => emptyMutation(fetcher, "/api/staff/telegram/disconnect");
export const revokeOwnTelegramConnectionRequest = (fetcher: Fetcher) => emptyMutation(fetcher, "/api/staff/telegram/connection-request/revoke");
export const forceDisconnectStaffTelegram = (fetcher: Fetcher, staffAccountId: string) => emptyMutation(fetcher, `/api/staff/team/accounts/${encodeURIComponent(staffAccountId)}/telegram/disconnect`);
export const revokeStaffTelegramConnectionRequest = (fetcher: Fetcher, staffAccountId: string) => emptyMutation(fetcher, `/api/staff/team/accounts/${encodeURIComponent(staffAccountId)}/telegram/connection-request/revoke`);
