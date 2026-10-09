import {randomBytes} from "node:crypto";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {acquisitionDatabaseConfig, readAcquisitionSecret} from "@/features/customer-acquisition/infrastructure/config/acquisition-config";

describe("acquisition fail-closed configuration", () => {
  it("uses only independently named file credentials and fixed database identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "acquisition-config-test-")); const path = join(directory, "credential");
    try {
      const secret = randomBytes(32).toString("hex"); writeFileSync(path, secret);
      const environment = {ACQUISITION_MODE: "synthetic-local", ACQUISITION_RUNTIME_PASSWORD_FILE: path, ACQUISITION_MIGRATOR_PASSWORD_FILE: path};
      expect(acquisitionDatabaseConfig(environment, "runtime")).toMatchObject({host: "acquisition-postgres", database: "yolpol_acquisition", user: "acquisition_runtime", password: secret});
      expect(acquisitionDatabaseConfig(environment, "migration").user).toBe("acquisition_migrator");
      expect(() => acquisitionDatabaseConfig({...environment, DATABASE_URL: "forbidden"}, "runtime")).toThrow("isolated");
      expect(() => acquisitionDatabaseConfig({...environment, YOLPOL_DEPLOYMENT_ENVIRONMENT: "production"}, "runtime")).toThrow("isolated");
      writeFileSync(path, "short"); expect(() => readAcquisitionSecret(path)).toThrow("32 random bytes");
    } finally { rmSync(directory, {recursive: true, force: true}); }
  });
});
