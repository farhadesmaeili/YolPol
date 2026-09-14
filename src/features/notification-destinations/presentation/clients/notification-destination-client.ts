type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type NotificationDestinationCommand =
  | Readonly<{operation: "ENABLE_TEAM_MEMBER" | "DISABLE_TEAM_MEMBER"; staffAccountId: string}>
  | Readonly<{operation: "CREATE_GROUP_REQUEST" | "REVOKE_GROUP_REQUEST"}>
  | Readonly<{operation: "ENABLE_GROUP" | "DISABLE_GROUP" | "DISCONNECT_GROUP"; recipientId: string}>;

export async function mutateNotificationDestination(fetcher: Fetcher, command: NotificationDestinationCommand): Promise<Readonly<{status: "completed"}> | Readonly<{status: "group_request"; deepLink: string; expiresAt: string}> | Readonly<{status: "failed"; code?: string}>> {
  try {
    const response = await fetcher("/api/staff/notification-destinations", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(command),
    });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== "object" || body === null) {
      const code = typeof body === "object" && body !== null && "code" in body && typeof body.code === "string" ? body.code : undefined;
      return {status: "failed", ...(code ? {code} : {})};
    }
    if (command.operation === "CREATE_GROUP_REQUEST") {
      if (!("deepLink" in body) || typeof body.deepLink !== "string" || !("expiresAt" in body) || typeof body.expiresAt !== "string") return {status: "failed"};
      const url = new URL(body.deepLink);
      if (url.protocol !== "https:" || url.hostname !== "t.me" || !url.searchParams.has("startgroup") || !Number.isFinite(Date.parse(body.expiresAt))) return {status: "failed"};
      return {status: "group_request", deepLink: body.deepLink, expiresAt: body.expiresAt};
    }
    return {status: "completed"};
  } catch { return {status: "failed"}; }
}
