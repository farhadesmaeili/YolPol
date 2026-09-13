import {existsSync} from "node:fs";
import {loadEnvFile} from "node:process";

import {BootstrapSuperAdmin} from "../../src/features/staff-authentication/application/use-cases/bootstrap-super-admin";
import {PostgresStaffManagementRepository} from "../../src/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-management-repository";
import {runStaffBootstrapSuperAdminCli} from "../../src/features/staff-authentication/presentation/cli/staff-bootstrap-super-admin-cli";
import {createPostgresPool} from "../../src/features/inquiries/infrastructure/database/postgres-pool";
import {readPostgresConfig} from "../../src/features/inquiries/infrastructure/database/postgres-config";
import {NodeStaffProvisioningTerminal, StaffProvisioningAbortedError} from "./node-terminal";

function loadLocalDatabaseEnvironment(): void {
  if (process.env.DATABASE_URL) return;
  const environment = process.env.NODE_ENV === "production" ? "production" : "development";
  for (const candidate of [`.env.${environment}.local`, ".env.local", `.env.${environment}`, ".env"]) {
    if (!existsSync(candidate)) continue;
    loadEnvFile(candidate);
    if (process.env.DATABASE_URL) return;
  }
}

async function main(): Promise<number> {
  const terminal = new NodeStaffProvisioningTerminal();
  if (process.argv.slice(2).length > 0 || !terminal.isInteractive()) {
    return runStaffBootstrapSuperAdminCli({terminal, bootstrap: {execute: async () => ({status: "persistence_failed"})}, arguments: process.argv.slice(2)});
  }
  loadLocalDatabaseEnvironment();
  const pool = createPostgresPool({...readPostgresConfig(), max: 1});
  try {
    return await runStaffBootstrapSuperAdminCli({
      terminal,
      bootstrap: new BootstrapSuperAdmin(new PostgresStaffManagementRepository(pool), {now: () => new Date()}),
      arguments: [],
    });
  } finally { await pool.end(); }
}

main().then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
  process.stderr.write(error instanceof StaffProvisioningAbortedError
    ? "Super Admin bootstrap aborted. No account was changed.\n"
    : "Super Admin bootstrap failed safely. No account was changed.\n");
  process.exitCode = error instanceof StaffProvisioningAbortedError ? 130 : 1;
});
