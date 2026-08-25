import {existsSync} from "node:fs";
import {loadEnvFile} from "node:process";

import {ProvisionStaffAccount} from "../../src/features/staff-authentication/application/use-cases/provision-staff-account";
import {PostgresStaffProvisioningRepository} from "../../src/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-provisioning-repository";
import {NodeScryptPasswordHasher} from "../../src/features/staff-authentication/infrastructure/security/node-scrypt-password-hasher";
import {NodeStaffAccountIdGenerator} from "../../src/features/staff-authentication/infrastructure/security/node-staff-account-id-generator";
import {runStaffProvisioningCli} from "../../src/features/staff-authentication/presentation/cli/staff-provisioning-cli";
import {createPostgresPool} from "../../src/features/inquiries/infrastructure/database/postgres-pool";
import {readPostgresConfig} from "../../src/features/inquiries/infrastructure/database/postgres-config";
import {NodeStaffProvisioningTerminal, StaffProvisioningAbortedError} from "./node-terminal";

function loadLocalDatabaseEnvironment(): void {
  if (process.env.DATABASE_URL) return;
  const environment = process.env.NODE_ENV === "production" ? "production" : "development";
  const candidates = [`.env.${environment}.local`, ".env.local", `.env.${environment}`, ".env"];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    loadEnvFile(candidate);
    if (process.env.DATABASE_URL) return;
  }
}

async function main(): Promise<number> {
  const terminal = new NodeStaffProvisioningTerminal();
  if (process.argv.slice(2).length > 0 || !terminal.isInteractive()) {
    return runStaffProvisioningCli({terminal, provision: {execute: async () => ({status: "dependency_failed"})}, arguments: process.argv.slice(2)});
  }

  loadLocalDatabaseEnvironment();
  const pool = createPostgresPool({...readPostgresConfig(), max: 1});
  try {
    const provision = new ProvisionStaffAccount(
      new PostgresStaffProvisioningRepository(pool),
      new NodeScryptPasswordHasher(),
      new NodeStaffAccountIdGenerator(),
      {now: () => new Date()},
    );
    return await runStaffProvisioningCli({terminal, provision, arguments: []});
  } finally {
    await pool.end();
  }
}

main().then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
  if (error instanceof StaffProvisioningAbortedError) {
    process.stderr.write("Staff provisioning aborted. No account was created.\n");
    process.exitCode = 130;
    return;
  }
  process.stderr.write("Staff provisioning failed safely. No account was created.\n");
  process.exitCode = 1;
});
