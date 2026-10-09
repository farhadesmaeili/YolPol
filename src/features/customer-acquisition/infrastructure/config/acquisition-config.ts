import {readFileSync} from "node:fs";
import type {PoolConfig} from "pg";

type Environment = Readonly<Record<string, string | undefined>>;
export function readAcquisitionSecret(path: string | undefined): string {
  if (!path) throw new Error("Acquisition secret file is required.");
  let value: string;
  try { value = readFileSync(path, "utf8").trim(); } catch { throw new Error("Acquisition secret file is unavailable."); }
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("Acquisition secret must be 32 random bytes encoded as hexadecimal.");
  return value;
}

export function acquisitionDatabaseConfig(environment: Environment, purpose: "runtime" | "migration"): PoolConfig {
  if (environment.ACQUISITION_MODE !== "synthetic-local" || environment.YOLPOL_DEPLOYMENT_ENVIRONMENT || environment.DATABASE_URL || environment.ACQUISITION_DATABASE_URL) throw new Error("Acquisition environment is not isolated.");
  return {host: "acquisition-postgres", port: 5432, database: "yolpol_acquisition",
    user: purpose === "runtime" ? "acquisition_runtime" : "acquisition_migrator",
    password: readAcquisitionSecret(purpose === "runtime" ? environment.ACQUISITION_RUNTIME_PASSWORD_FILE : environment.ACQUISITION_MIGRATOR_PASSWORD_FILE),
    max: purpose === "runtime" ? 4 : 1, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 6000,
    application_name: `yolpol-acquisition-${purpose}`};
}
