import {describe, expect, it} from "vitest";

import {presentStaffPrincipal} from "@/features/staff-authentication/presentation/presenters/staff-principal-presenter";

describe("Staff principal presenter", () => {
  it("projects only safe identity fields across the HTTP boundary", () => {
    const response = presentStaffPrincipal({staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Staff Member", actorReference: "staff:member-1"});
    expect(response).toEqual({staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Staff Member"});
    const serialized = JSON.stringify(response).toLowerCase();
    for (const forbidden of ["password", "token", "digest", "credential", "conversationaccess", "internalunitprice", "database_url", "telegram_bot_token", "webhook_secret", "smtp"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
