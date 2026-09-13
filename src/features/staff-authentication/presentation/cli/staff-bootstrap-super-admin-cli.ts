import type {StaffProvisioningTerminal} from "@/features/staff-authentication/presentation/cli/staff-provisioning-cli";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";

type Executor = Readonly<{execute(input: Readonly<{staffAccountId: unknown}>): Promise<Readonly<{status: string}>>}>;

export async function runStaffBootstrapSuperAdminCli(options: Readonly<{
  terminal: StaffProvisioningTerminal;
  bootstrap: Executor;
  arguments: readonly string[];
}>): Promise<number> {
  const {terminal} = options;
  if (options.arguments.length > 0) {
    terminal.writeError("Super Admin bootstrap accepts no command-line arguments.\n");
    return 1;
  }
  if (!terminal.isInteractive()) {
    terminal.writeError("Super Admin bootstrap requires an interactive TTY.\n");
    return 1;
  }
  terminal.write("YOLPOL First Super Admin Bootstrap\n\n");
  const entered = await terminal.ask("Existing active ADMIN Staff Account ID: ");
  let staffAccountId: string;
  try { staffAccountId = StaffAccountReference.create(entered.trim()).value; }
  catch { terminal.writeError("The Staff Account ID is invalid. No account was changed.\n"); return 1; }
  terminal.write("This one-time operation promotes the selected active ADMIN to SUPER_ADMIN.\n");
  const confirmation = (await terminal.ask("Confirm [y/N]: ")).trim().toLowerCase();
  if (confirmation !== "y" && confirmation !== "yes") {
    terminal.write("Bootstrap cancelled. No account was changed.\n");
    return 0;
  }
  const result = await options.bootstrap.execute({staffAccountId});
  if (result.status === "promoted") {
    terminal.write("First Super Admin bootstrap completed successfully.\n");
    return 0;
  }
  const messages: Record<string, string> = {
    validation_failed: "The Staff Account ID is invalid.",
    not_found: "The Staff Account was not found.",
    ineligible: "The target must be an active ADMIN linked to an active Team Member.",
    already_bootstrapped: "Super Admin bootstrap has already been completed.",
    persistence_failed: "The database operation could not be completed safely.",
  };
  terminal.writeError(`${messages[result.status] ?? "Super Admin bootstrap failed safely."} No account was changed.\n`);
  return 1;
}
