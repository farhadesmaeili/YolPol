import {readFileSync, statSync} from "node:fs";
import type {PoolConfig} from "pg";

export function discoveryDatabaseConfig(environment: Readonly<Record<string, string | undefined>>, capability: "INTAKE" | "REVIEW"): PoolConfig {
  if (environment.ACQUISITION_MODE !== "synthetic-local" || environment.YOLPOL_DEPLOYMENT_ENVIRONMENT || environment.DATABASE_URL || environment.ACQUISITION_DATABASE_URL) {
    throw new Error("Discovery database environment rejected.");
  }
  try {
    const path = capability === "INTAKE" ? environment.ACQUISITION_DISCOVERY_INTAKE_PASSWORD_FILE : environment.ACQUISITION_DISCOVERY_REVIEWER_PASSWORD_FILE;
    if (!path) throw new Error();
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 128 || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new Error();
    const password = readFileSync(path, "utf8").trim();
    if (!/^[a-f0-9]{64}$/u.test(password)) throw new Error();
    return {host: "acquisition-postgres", port: 5432, database: "yolpol_acquisition",
      user: capability === "INTAKE" ? "discovery_intake" : "discovery_reviewer", password,
      max: 2, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 6000,
      application_name: capability === "INTAKE" ? "yolpol-discovery-intake" : "yolpol-discovery-reviewer"};
  } catch { throw new Error("Discovery database credential configuration rejected."); }
}
