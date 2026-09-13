import {describe, expect, it} from "vitest";

import {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import {StaffInvitation} from "@/features/staff-authentication/domain/entities/staff-invitation";
import {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";

const createdAt = new Date("2026-08-25T08:00:00.000Z");

describe("Staff authentication domain", () => {
  it("normalizes login email deterministically and rejects malformed or oversized values", () => {
    expect(StaffEmail.create("  Staff.Member@Example.COM ").value).toBe("staff.member@example.com");
    expect(() => StaffEmail.create("not-an-email")).toThrow();
    expect(() => StaffEmail.create(`${"a".repeat(65)}@example.com`)).toThrow();
    expect(() => StaffEmail.create(`${"a".repeat(245)}@example.com`)).toThrow();
  });

  it("accepts only the deliberately small role set", () => {
    expect(parseStaffRole("ADMIN")).toBe("ADMIN");
    expect(parseStaffRole("SALES")).toBe("SALES");
    expect(parseStaffRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    expect(parseStaffRole("VIEWER")).toBe("VIEWER");
    expect(() => parseStaffRole("OWNER")).toThrow();
  });

  it("reconstitutes normalized accounts and rejects invalid persisted state", () => {
    const account = StaffAccount.reconstitute({id: "account-1", teamMemberId: "member-1", normalizedEmail: "staff@example.com", passwordHash: "stored-hash", role: "SALES", active: true, createdAt, updatedAt: createdAt});
    expect(account).toMatchObject({id: "account-1", teamMemberId: "member-1", role: "SALES", active: true});
    expect(() => StaffAccount.reconstitute({id: "account-1", teamMemberId: "member-1", normalizedEmail: " Staff@example.com ", passwordHash: "stored-hash", role: "SALES", active: true, createdAt, updatedAt: createdAt})).toThrow();
    expect(() => StaffAccount.reconstitute({id: "account-1", teamMemberId: "member-1", normalizedEmail: "staff@example.com", passwordHash: "stored-hash", role: "UNKNOWN", active: true, createdAt, updatedAt: createdAt})).toThrow();
  });

  it("enforces absolute expiry and valid revocation timestamps", () => {
    const session = StaffSession.reconstitute({id: "session-1", staffAccountId: "account-1", tokenLookup: "a".repeat(64), tokenVerification: "b".repeat(64), createdAt, expiresAt: new Date(createdAt.getTime() + 1_000)});
    expect(session.isExpired(new Date(createdAt.getTime() + 999))).toBe(false);
    expect(session.isExpired(new Date(createdAt.getTime() + 1_000))).toBe(true);
    expect(session.isRevoked()).toBe(false);
    expect(() => StaffSession.reconstitute({id: "session-1", staffAccountId: "account-1", tokenLookup: "a".repeat(64), tokenVerification: "b".repeat(64), createdAt, expiresAt: createdAt})).toThrow();
  });

  it("keeps invitations digest-only, non-Super-Admin, finite, and single-terminal-state", () => {
    const base = {id: "invitation-1", normalizedEmail: "staff@example.com", displayName: "Staff", targetRole: "VIEWER", tokenLookup: "a".repeat(64), tokenVerification: "b".repeat(64), createdByStaffAccountId: "account-1", createdAt, expiresAt: new Date(createdAt.getTime() + 1_000)} as const;
    expect(StaffInvitation.create(base).isAvailable(new Date(createdAt.getTime() + 999))).toBe(true);
    expect(StaffInvitation.create(base).isAvailable(new Date(createdAt.getTime() + 1_000))).toBe(false);
    expect(() => StaffInvitation.create({...base, targetRole: "SUPER_ADMIN"})).toThrow();
    expect(() => StaffInvitation.reconstitute({...base, consumedAt: createdAt, revokedAt: createdAt})).toThrow();
    expect(() => StaffInvitation.create({...base, tokenLookup: "raw-activation-code"})).toThrow();
  });
});
