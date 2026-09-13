import {describe, expect, it} from "vitest";

import {
  customerConversationCookieName,
  readCustomerConversationCookie,
  serializeCustomerConversationCookie,
} from "@/features/inquiries/infrastructure/http/customer-conversation-cookie";

const token = `ypc_${"A".repeat(43)}`;
const expiresAt = new Date("2026-09-27T12:00:00.000Z");

describe("Customer Conversation resume cookie", () => {
  it("uses a host-only production name and a development HTTP-compatible name", () => {
    expect(customerConversationCookieName({NODE_ENV: "production"})).toBe("__Host-yolpol_customer_conversation");
    expect(customerConversationCookieName({NODE_ENV: "development"})).toBe("yolpol_customer_conversation");
    expect(serializeCustomerConversationCookie(token, expiresAt, {NODE_ENV: "production"})).toBe(`__Host-yolpol_customer_conversation=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=2592000; Expires=Sun, 27 Sep 2026 12:00:00 GMT`);
    expect(serializeCustomerConversationCookie(token, expiresAt, {NODE_ENV: "development"})).not.toContain("Secure");
  });

  it("reads exactly one valid environment-specific cookie across locale paths", () => {
    const request = new Request("https://yolpol.com/fa/inquiry", {headers: {Cookie: `other=value; __Host-yolpol_customer_conversation=${token}`}});
    expect(readCustomerConversationCookie(request, {NODE_ENV: "production"})).toBe(token);
    expect(readCustomerConversationCookie(request, {NODE_ENV: "development"})).toBeNull();
  });

  it.each([
    "",
    "__Host-yolpol_customer_conversation=malformed",
    `__Host-yolpol_customer_conversation=${token}; __Host-yolpol_customer_conversation=${token}`,
  ])("rejects missing, malformed, or duplicate credentials", (cookie) => {
    expect(readCustomerConversationCookie(new Request("https://yolpol.com/en/inquiry", {headers: cookie ? {Cookie: cookie} : {}}), {NODE_ENV: "production"})).toBeNull();
  });
});
