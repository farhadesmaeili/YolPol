import type {ProvisionStaffAccountInput} from "@/features/staff-authentication/application/use-cases/provision-staff-account";
import type {ProvisionStaffAccountResult} from "@/features/staff-authentication/application/results/staff-provisioning-results";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";
import {StaffDisplayName} from "@/features/staff-authentication/domain/value-objects/staff-display-name";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";
import {StaffPassword} from "@/features/staff-authentication/domain/value-objects/staff-password";

export interface StaffProvisioningTerminal {
  isInteractive(): boolean;
  ask(prompt: string): Promise<string>;
  askSecret(prompt: string): Promise<string>;
  write(message: string): void;
  writeError(message: string): void;
}

export interface StaffProvisioningExecutor {
  execute(input: ProvisionStaffAccountInput): Promise<ProvisionStaffAccountResult>;
}

type StaffProvisioningPreview = Readonly<{
  teamMemberId: string;
  displayName: string;
  normalizedEmail: string;
  role: "ADMIN" | "SALES";
}>;

function createPreview(input: ProvisionStaffAccountInput): StaffProvisioningPreview | null {
  try {
    StaffPassword.create(input.password);
    return Object.freeze({
      teamMemberId: StaffAccountReference.create(input.teamMemberId).value,
      displayName: StaffDisplayName.create(input.displayName).value,
      normalizedEmail: StaffEmail.create(input.email).value,
      role: parseStaffRole(input.role),
    });
  } catch {
    return null;
  }
}

function writeFailure(terminal: StaffProvisioningTerminal, result: Exclude<ProvisionStaffAccountResult, {status: "provisioned"}>): void {
  const messages: Record<typeof result.status, string> = {
    validation_failed: "Validation failed. No account was created.",
    inactive_team_member: "The Team Member is inactive. No account was created.",
    team_member_conflict: "The Team Member details conflict with the existing record. Operator review is required.",
    already_provisioned: "The Team Member already has a Staff Account. No account was changed.",
    email_conflict: "The login email already belongs to a Staff Account. No account was changed.",
    persistence_failed: "The database is unavailable or the operation could not be completed safely.",
    dependency_failed: "A required provisioning security dependency is unavailable.",
  };
  terminal.writeError(`${messages[result.status]}\n`);
}

export async function runStaffProvisioningCli(options: Readonly<{
  terminal: StaffProvisioningTerminal;
  provision: StaffProvisioningExecutor;
  arguments: readonly string[];
}>): Promise<number> {
  const {terminal, provision} = options;
  if (options.arguments.length > 0) {
    terminal.writeError("Staff provisioning accepts no command-line arguments. Run pnpm staff:provision interactively.\n");
    return 1;
  }
  if (!terminal.isInteractive()) {
    terminal.writeError("Staff provisioning requires an interactive TTY. Pipes, redirection, and CI invocation are refused.\n");
    return 1;
  }

  terminal.write("YOLPOL Staff Provisioning\n\n");
  const teamMemberId = await terminal.ask("Team Member ID: ");
  const displayName = await terminal.ask("Display Name: ");
  const email = await terminal.ask("Login Email: ");
  const role = (await terminal.ask("Role [ADMIN/SALES]: ")).trim().toUpperCase();
  let password = await terminal.askSecret("Password: ");
  let passwordConfirmation = await terminal.askSecret("Confirm Password: ");

  try {
    if (password !== passwordConfirmation) {
      terminal.writeError("Password confirmation does not match. No account was created.\n");
      return 1;
    }

    const input = {teamMemberId, displayName, email, role, password} satisfies ProvisionStaffAccountInput;
    const preview = createPreview(input);
    if (!preview) {
      terminal.writeError("Validation failed. No account was created.\n");
      return 1;
    }

    terminal.write("\nProvision Staff Account?\n");
    terminal.write(`Team Member ID: ${preview.teamMemberId}\n`);
    terminal.write(`Display Name: ${preview.displayName}\n`);
    terminal.write(`Login Email: ${preview.normalizedEmail}\n`);
    terminal.write(`Role: ${preview.role}\n`);
    const confirmation = (await terminal.ask("Confirm [y/N]: ")).trim().toLowerCase();
    if (confirmation !== "y" && confirmation !== "yes") {
      terminal.write("Provisioning cancelled. No account was created.\n");
      return 0;
    }

    const result = await provision.execute(input);
    if (result.status !== "provisioned") {
      writeFailure(terminal, result);
      return 1;
    }
    terminal.write("Staff account provisioned successfully.\n");
    terminal.write(`Team member: ${result.displayName} (${result.teamMemberId})\n`);
    terminal.write(`Role: ${result.role}\n`);
    return 0;
  } finally {
    password = "";
    passwordConfirmation = "";
  }
}
