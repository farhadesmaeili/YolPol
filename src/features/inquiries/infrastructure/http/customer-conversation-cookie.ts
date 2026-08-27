import {customerConversationResumeLifetimeMs} from "@/features/inquiries/application/config/customer-conversation-access-policy";

const productionCookieName = "__Host-yolpol_customer_conversation";
const developmentCookieName = "yolpol_customer_conversation";
const tokenPattern = /^ypc_[A-Za-z0-9_-]{43}$/u;

export type CustomerConversationCookieEnvironment = Readonly<{NODE_ENV?: string}>;

export function customerConversationCookieName(environment: CustomerConversationCookieEnvironment = process.env): string {
  return environment.NODE_ENV === "production" ? productionCookieName : developmentCookieName;
}

export function readCustomerConversationCookie(
  request: Request,
  environment: CustomerConversationCookieEnvironment = process.env,
): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  const expectedName = customerConversationCookieName(environment);
  const values: string[] = [];
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== expectedName) continue;
    values.push(segment.slice(separator + 1).trim());
  }

  return values.length === 1 && values[0] && tokenPattern.test(values[0]) ? values[0] : null;
}

function attributes(environment: CustomerConversationCookieEnvironment): string {
  return `Path=/; HttpOnly; SameSite=Strict${environment.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function serializeCustomerConversationCookie(
  credential: string,
  expiresAt: Date,
  environment: CustomerConversationCookieEnvironment = process.env,
): string {
  if (!tokenPattern.test(credential) || !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
    throw new Error("Customer Conversation cookie input is invalid.");
  }

  return `${customerConversationCookieName(environment)}=${credential}; ${attributes(environment)}; Max-Age=${customerConversationResumeLifetimeMs / 1_000}; Expires=${expiresAt.toUTCString()}`;
}
