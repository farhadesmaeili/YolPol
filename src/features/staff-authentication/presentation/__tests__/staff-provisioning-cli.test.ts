import {describe, expect, it, vi} from "vitest";

import type {ProvisionStaffAccountResult} from "@/features/staff-authentication/application/results/staff-provisioning-results";
import {runStaffBootstrapSuperAdminCli} from "@/features/staff-authentication/presentation/cli/staff-bootstrap-super-admin-cli";
import {runStaffProvisioningCli, type StaffProvisioningExecutor, type StaffProvisioningTerminal} from "@/features/staff-authentication/presentation/cli/staff-provisioning-cli";

class FakeTerminal implements StaffProvisioningTerminal {
  readonly output: string[] = [];
  readonly errors: string[] = [];
  constructor(private readonly answers: string[] = [], private readonly interactive = true) {}
  isInteractive(): boolean { return this.interactive; }
  async ask(): Promise<string> { return this.answers.shift() ?? ""; }
  async askSecret(): Promise<string> { return this.answers.shift() ?? ""; }
  write(message: string): void { this.output.push(message); }
  writeError(message: string): void { this.errors.push(message); }
}

function executor(result: ProvisionStaffAccountResult = {status: "provisioned", teamMemberCreated: true, teamMemberId: "member-1", displayName: "Staff Member", normalizedEmail: "staff@example.com", role: "ADMIN"}) {
  return {execute: vi.fn<StaffProvisioningExecutor["execute"]>().mockResolvedValue(result)};
}

const answers = ["member-1", "Staff Member", " Staff@Example.com ", "admin", "correct horse battery staple", "correct horse battery staple", "y"];

describe("staff provisioning CLI", () => {
  it("refuses non-TTY and every command-line argument before provisioning", async () => {
    const nonTty = new FakeTerminal([], false);
    const nonTtyExecutor = executor();
    await expect(runStaffProvisioningCli({terminal: nonTty, provision: nonTtyExecutor, arguments: []})).resolves.toBe(1);
    expect(nonTtyExecutor.execute).not.toHaveBeenCalled();
    expect(nonTty.errors.join("")).toContain("interactive TTY");

    const withArguments = new FakeTerminal();
    const argumentExecutor = executor();
    await expect(runStaffProvisioningCli({terminal: withArguments, provision: argumentExecutor, arguments: ["--password=exposed"]})).resolves.toBe(1);
    expect(argumentExecutor.execute).not.toHaveBeenCalled();
    expect(withArguments.errors.join("")).not.toContain("exposed");
  });

  it("rejects password mismatch and decline without invoking provisioning", async () => {
    const mismatch = new FakeTerminal(["member-1", "Staff", "staff@example.com", "ADMIN", "first secure password", "second secure password"]);
    const mismatchExecutor = executor();
    await expect(runStaffProvisioningCli({terminal: mismatch, provision: mismatchExecutor, arguments: []})).resolves.toBe(1);
    expect(mismatchExecutor.execute).not.toHaveBeenCalled();

    const decline = new FakeTerminal([...answers.slice(0, -1), "n"]);
    const declineExecutor = executor();
    await expect(runStaffProvisioningCli({terminal: decline, provision: declineExecutor, arguments: []})).resolves.toBe(0);
    expect(declineExecutor.execute).not.toHaveBeenCalled();
  });

  it("shows only normalized non-secret confirmation and safe success output", async () => {
    const terminal = new FakeTerminal([...answers]);
    const provision = executor();
    await expect(runStaffProvisioningCli({terminal, provision, arguments: []})).resolves.toBe(0);
    expect(provision.execute).toHaveBeenCalledWith(expect.objectContaining({email: " Staff@Example.com ", role: "ADMIN"}));
    const visible = [...terminal.output, ...terminal.errors].join("");
    expect(visible).toContain("Login Email: staff@example.com");
    expect(visible).toContain("Staff account provisioned successfully.");
    expect(visible).not.toContain("correct horse battery staple");
    expect(visible).not.toMatch(/passwordHash|yolpol-scrypt/u);
  });

  it("does not expose raw persistence errors or invoke provisioning after an input abort", async () => {
    const failureTerminal = new FakeTerminal([...answers]);
    const failureExecutor: StaffProvisioningExecutor = {execute: vi.fn().mockRejectedValue(new Error("postgresql://user:secret@host/database"))};
    await expect(runStaffProvisioningCli({terminal: failureTerminal, provision: failureExecutor, arguments: []})).rejects.toThrow();
    expect([...failureTerminal.output, ...failureTerminal.errors].join("")).not.toContain("postgresql://");

    const abort = new Error("aborted");
    const abortTerminal = new FakeTerminal(["member-1", "Staff", "staff@example.com", "ADMIN"]);
    abortTerminal.askSecret = async () => { throw abort; };
    const abortExecutor = executor();
    await expect(runStaffProvisioningCli({terminal: abortTerminal, provision: abortExecutor, arguments: []})).rejects.toBe(abort);
    expect(abortExecutor.execute).not.toHaveBeenCalled();
  });
});

describe("first Super Admin bootstrap CLI", () => {
  it("refuses non-TTY execution and command-line arguments without invoking bootstrap", async () => {
    for (const input of [
      {terminal: new FakeTerminal([], false), arguments: []},
      {terminal: new FakeTerminal(), arguments: ["--account=secret"]},
    ]) {
      const bootstrap = {execute: vi.fn().mockResolvedValue({status: "promoted"})};
      await expect(runStaffBootstrapSuperAdminCli({...input, bootstrap})).resolves.toBe(1);
      expect(bootstrap.execute).not.toHaveBeenCalled();
      expect(input.terminal.errors.join("")).not.toContain("secret");
    }
  });

  it.each(["", "not a valid id", "a".repeat(129)])("rejects a blank or invalid account ID without invoking bootstrap", async (staffAccountId) => {
    const terminal = new FakeTerminal([staffAccountId]);
    const bootstrap = {execute: vi.fn().mockResolvedValue({status: "promoted"})};

    await expect(runStaffBootstrapSuperAdminCli({terminal, bootstrap, arguments: []})).resolves.toBe(1);
    expect(bootstrap.execute).not.toHaveBeenCalled();
    expect(terminal.errors.join("")).toContain("invalid");
  });

  it.each(["", "n", "no", "proceed"])("treats confirmation %j as cancellation without invoking bootstrap", async (confirmation) => {
    const terminal = new FakeTerminal(["account-admin", confirmation]);
    const bootstrap = {execute: vi.fn().mockResolvedValue({status: "promoted"})};

    await expect(runStaffBootstrapSuperAdminCli({terminal, bootstrap, arguments: []})).resolves.toBe(0);
    expect(bootstrap.execute).not.toHaveBeenCalled();
    expect(terminal.output.join("")).toContain("cancelled");
  });

  it.each(["y", "yes", " Y ", " YES "])("accepts only the normalized y/yes confirmation form %j", async (confirmation) => {
    const terminal = new FakeTerminal(["account-admin", confirmation]);
    const bootstrap = {execute: vi.fn().mockResolvedValue({status: "promoted"})};

    await expect(runStaffBootstrapSuperAdminCli({terminal, bootstrap, arguments: []})).resolves.toBe(0);
    expect(bootstrap.execute).toHaveBeenCalledExactlyOnceWith({staffAccountId: "account-admin"});
  });

  it("requires explicit confirmation and prints no account credentials", async () => {
    const declined = new FakeTerminal(["account-admin", "n"]);
    const declinedBootstrap = {execute: vi.fn().mockResolvedValue({status: "promoted"})};
    await expect(runStaffBootstrapSuperAdminCli({terminal: declined, bootstrap: declinedBootstrap, arguments: []})).resolves.toBe(0);
    expect(declinedBootstrap.execute).not.toHaveBeenCalled();

    const terminal = new FakeTerminal(["account-admin", "yes"]);
    const bootstrap = {execute: vi.fn().mockResolvedValue({status: "promoted"})};
    await expect(runStaffBootstrapSuperAdminCli({terminal, bootstrap, arguments: []})).resolves.toBe(0);
    expect(bootstrap.execute).toHaveBeenCalledWith({staffAccountId: "account-admin"});
    const visible = [...terminal.output, ...terminal.errors].join("");
    expect(visible).toContain("completed successfully");
    expect(visible).not.toContain("account-admin");
    expect(visible).not.toMatch(/password|token|credential/iu);
  });

  it("reports ineligible and already-bootstrapped outcomes without raw persistence details", async () => {
    for (const status of ["ineligible", "already_bootstrapped", "persistence_failed"] as const) {
      const terminal = new FakeTerminal(["account-admin", "y"]);
      const bootstrap = {execute: vi.fn().mockResolvedValue({status})};
      await expect(runStaffBootstrapSuperAdminCli({terminal, bootstrap, arguments: []})).resolves.toBe(1);
      expect(terminal.errors.join("")).not.toMatch(/postgres|database url|secret/iu);
    }
  });
});
