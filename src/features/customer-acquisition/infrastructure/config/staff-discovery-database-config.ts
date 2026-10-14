import {readFileSync, statSync} from "node:fs";
import type {ClientConfig} from "pg";

export function staffDiscoveryDatabaseConfig(environment: Readonly<Record<string, string | undefined>>): ClientConfig {
  if (environment.ACQUISITION_DISPOSABLE_TEST !== "true" || environment.ACQUISITION_MODE !== "synthetic-local"
    || environment.YOLPOL_DEPLOYMENT_ENVIRONMENT || environment.DATABASE_URL || environment.ACQUISITION_DATABASE_URL) {
    throw new Error("Staff discovery reader environment rejected.");
  }
  try {
    const path = environment.ACQUISITION_DISCOVERY_STAFF_READER_PASSWORD_FILE;
    if (!path) throw new Error();
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 128 || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new Error();
    const password = readFileSync(path, "utf8").trim();
    if (!/^[a-f0-9]{64}$/u.test(password)) throw new Error();
    return {host: "acquisition-postgres", port: 5432, database: "yolpol_acquisition", user: "discovery_staff_reader", password,
      connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 6000,
      application_name: "yolpol-discovery-staff-reader"};
  } catch { throw new Error("Staff discovery reader credential configuration rejected."); }
}
