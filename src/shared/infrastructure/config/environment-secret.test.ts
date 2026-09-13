import {describe, expect, it, vi} from "vitest";

import {
  InvalidEnvironmentSecretConfigurationError,
  readEnvironmentSecret,
  readEnvironmentSecretSync,
} from "@/shared/infrastructure/config/environment-secret";

const binding = Object.freeze({valueVariable: "SERVICE_SECRET", fileVariable: "SERVICE_SECRET_FILE"});

describe("environment secret loading", () => {
  it("reads direct and file-backed secrets with whitespace removed", async () => {
    await expect(readEnvironmentSecret(binding, {SERVICE_SECRET: " direct-secret\n"})).resolves.toBe("direct-secret");
    await expect(readEnvironmentSecret(
      binding,
      {SERVICE_SECRET_FILE: " /run/secrets/service "},
      vi.fn(async () => " file-secret\n"),
    )).resolves.toBe("file-secret");
    expect(readEnvironmentSecretSync(
      binding,
      {SERVICE_SECRET_FILE: " C:\\secrets\\service "},
      vi.fn(() => " file-secret\n"),
    )).toBe("file-secret");
  });

  it("rejects ambiguous direct and file-backed configuration", async () => {
    const environment = {SERVICE_SECRET: "direct-secret", SERVICE_SECRET_FILE: "/run/secrets/service"};
    await expect(readEnvironmentSecret(binding, environment)).rejects.toThrow(
      "SERVICE_SECRET and SERVICE_SECRET_FILE cannot both be configured.",
    );
  });

  it.each([
    {name: "missing", environment: {}, read: vi.fn(async () => "unused")},
    {name: "empty direct value", environment: {SERVICE_SECRET: " \n"}, read: vi.fn(async () => "unused")},
    {name: "empty file", environment: {SERVICE_SECRET_FILE: "safe-path"}, read: vi.fn(async () => " \n")},
    {name: "unreadable file", environment: {SERVICE_SECRET_FILE: "safe-path"}, read: vi.fn(async () => { throw new Error("sensitive-reader-detail"); })},
  ])("fails safely for $name", async ({environment, read}) => {
    const failure = await readEnvironmentSecret(binding, environment, read).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(InvalidEnvironmentSecretConfigurationError);
    expect(String(failure)).not.toContain("sensitive-reader-detail");
    expect(String(failure)).not.toContain("safe-path");
  });
});
