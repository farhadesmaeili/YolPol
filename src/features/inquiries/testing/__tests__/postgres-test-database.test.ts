import {describe, expect, it} from "vitest";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

describe("integration database safety guard", () => {
  it("accepts only the dedicated loopback database identity", () => {
    expect(safeIntegrationPoolConfig("postgresql://yolpol_test:secret@127.0.0.1:55432/yolpol_integration")).toMatchObject({max: 4});
  });

  it.each([
    "postgresql://yolpol_test:secret@database.internal:55432/yolpol_integration",
    "postgresql://yolpol:secret@127.0.0.1:55432/yolpol_integration",
    "postgresql://yolpol_test:secret@127.0.0.1:5432/yolpol_integration",
    "postgresql://yolpol_test:secret@127.0.0.1:55432/yolpol",
  ])("rejects unsafe integration target %s", (url) => {
    expect(() => safeIntegrationPoolConfig(url)).toThrow("Integration database safety check failed.");
  });
});
