import {describe, expect, it} from "vitest";

import type {PasswordHasher} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {StaffProvisioningPersistenceInput, StaffProvisioningPersistenceResult, StaffProvisioningRepository} from "@/features/staff-authentication/application/ports/staff-provisioning-ports";
import {ProvisionStaffAccount} from "@/features/staff-authentication/application/use-cases/provision-staff-account";

const now = new Date("2026-08-26T10:00:00.000Z");
const validInput = {
  teamMemberId: "member-1",
  displayName: "Staff Member",
  email: " Staff@Example.com ",
  role: "ADMIN",
  password: "correct horse battery staple",
} as const;

class RecordingPasswordHasher implements PasswordHasher {
  readonly hashedPasswords: string[] = [];
  async hash(password: string): Promise<string> { this.hashedPasswords.push(password); return "versioned-password-hash"; }
  async verify(): Promise<boolean> { return false; }
}

class RecordingProvisioningRepository implements StaffProvisioningRepository {
  readonly inputs: StaffProvisioningPersistenceInput[] = [];
  constructor(private readonly result: StaffProvisioningPersistenceResult = {status: "provisioned", teamMemberCreated: true}) {}
  async provision(input: StaffProvisioningPersistenceInput): Promise<StaffProvisioningPersistenceResult> {
    this.inputs.push(input);
    return this.result;
  }
}

function createUseCase(result?: StaffProvisioningPersistenceResult) {
  const repository = new RecordingProvisioningRepository(result);
  const passwords = new RecordingPasswordHasher();
  const useCase = new ProvisionStaffAccount(repository, passwords, {generate: () => "staff_123"}, {now: () => new Date(now)});
  return {useCase, repository, passwords};
}

describe("ProvisionStaffAccount", () => {
  it("creates the first Team Member and Staff Account through one persistence operation", async () => {
    const context = createUseCase({status: "provisioned", teamMemberCreated: true});
    await expect(context.useCase.execute(validInput)).resolves.toEqual({
      status: "provisioned",
      teamMemberCreated: true,
      teamMemberId: "member-1",
      displayName: "Staff Member",
      normalizedEmail: "staff@example.com",
      role: "ADMIN",
    });
    expect(context.repository.inputs).toHaveLength(1);
    expect(context.repository.inputs[0]?.account).toMatchObject({
      id: "staff_123",
      teamMemberId: "member-1",
      normalizedEmail: "staff@example.com",
      role: "ADMIN",
      active: true,
      passwordHash: "versioned-password-hash",
    });
  });

  it("links an account to an existing active Team Member without changing the application contract", async () => {
    const context = createUseCase({status: "provisioned", teamMemberCreated: false});
    await expect(context.useCase.execute(validInput)).resolves.toMatchObject({status: "provisioned", teamMemberCreated: false});
  });

  it.each([
    ["inactive Team Member", {status: "inactive_team_member"}],
    ["conflicting Team Member display name", {status: "team_member_conflict"}],
    ["already-provisioned Team Member", {status: "already_provisioned"}],
    ["duplicate login email", {status: "email_conflict"}],
  ] as const)("returns the safe conflict for an %s", async (_caseName, result) => {
    await expect(createUseCase(result).useCase.execute(validInput)).resolves.toEqual(result);
  });

  it.each([
    ["team_member_id", {...validInput, teamMemberId: "invalid member"}],
    ["display_name", {...validInput, displayName: " \u0000 "}],
    ["email", {...validInput, email: "invalid"}],
    ["role", {...validInput, role: "OWNER"}],
    ["password", {...validInput, password: "too-short"}],
    ["password", {...validInput, password: "x".repeat(1_025)}],
  ] as const)("rejects invalid %s before hashing or persistence", async (field, input) => {
    const context = createUseCase();
    await expect(context.useCase.execute(input)).resolves.toEqual({status: "validation_failed", field});
    expect(context.passwords.hashedPasswords).toEqual([]);
    expect(context.repository.inputs).toEqual([]);
  });

  it("invokes the existing hasher and never sends plaintext in the persistence DTO", async () => {
    const context = createUseCase();
    await context.useCase.execute(validInput);
    expect(context.passwords.hashedPasswords).toEqual([validInput.password]);
    expect(JSON.stringify(context.repository.inputs)).not.toContain(validInput.password);
  });

  it("maps password-hasher, ID, clock, and persistence failures to safe results", async () => {
    const repository = new RecordingProvisioningRepository();
    const failingHasher: PasswordHasher = {hash: async () => { throw new Error("secret dependency detail"); }, verify: async () => false};
    await expect(new ProvisionStaffAccount(repository, failingHasher, {generate: () => "staff_1"}, {now: () => now}).execute(validInput)).resolves.toEqual({status: "dependency_failed"});

    const passwords = new RecordingPasswordHasher();
    await expect(new ProvisionStaffAccount(repository, passwords, {generate: () => "invalid id"}, {now: () => now}).execute(validInput)).resolves.toEqual({status: "dependency_failed"});
    await expect(new ProvisionStaffAccount(repository, passwords, {generate: () => "staff_1"}, {now: () => new Date(Number.NaN)}).execute(validInput)).resolves.toEqual({status: "dependency_failed"});

    const failingRepository: StaffProvisioningRepository = {provision: async () => { throw new Error("postgresql://user:password@host/database"); }};
    await expect(new ProvisionStaffAccount(failingRepository, passwords, {generate: () => "staff_1"}, {now: () => now}).execute(validInput)).resolves.toEqual({status: "persistence_failed"});
  });
});
