import {describe, expect, it, vi} from "vitest";

import {EnvironmentAiCredentialSecretResolver} from "@/features/ai-provider-gateway/infrastructure/security/environment-ai-credential-secret-resolver";

const reference = "secret://ai/groq/primary";
const bindings = Object.freeze({[reference]: Object.freeze({environmentVariable: "TEST_GROQ_KEY", fileEnvironmentVariable: "TEST_GROQ_KEY_FILE"})});

describe("EnvironmentAiCredentialSecretResolver", () => {
  it("resolves a known reference from an injected environment and trims surrounding whitespace", async () => {
    const resolver = new EnvironmentAiCredentialSecretResolver(bindings, {TEST_GROQ_KEY: "  fake-value  "});
    await expect(resolver.resolve(reference)).resolves.toBe("fake-value");
  });

  it("prefers a Docker-Secret-friendly file binding", async () => {
    const read = vi.fn(async () => " file-secret\n");
    const resolver = new EnvironmentAiCredentialSecretResolver(bindings, {TEST_GROQ_KEY: "environment-secret", TEST_GROQ_KEY_FILE: " C:\\temporary\\secret "}, read);
    await expect(resolver.resolve(reference)).resolves.toBe("file-secret");
    expect(read).toHaveBeenCalledWith("C:\\temporary\\secret");
  });

  it.each([
    {name: "unsupported reference", environment: {}, requested: "secret://ai/other/primary", read: vi.fn()},
    {name: "missing environment value", environment: {}, requested: reference, read: vi.fn()},
    {name: "empty environment value", environment: {TEST_GROQ_KEY: "   "}, requested: reference, read: vi.fn()},
    {name: "empty file", environment: {TEST_GROQ_KEY_FILE: "safe-file"}, requested: reference, read: vi.fn(async () => " \n")},
    {name: "unreadable file", environment: {TEST_GROQ_KEY_FILE: "safe-file"}, requested: reference, read: vi.fn(async () => { throw new Error("fake-secret-must-not-escape"); })},
  ])("returns one safe failure for $name", async ({environment, requested, read}) => {
    const resolver = new EnvironmentAiCredentialSecretResolver(bindings, environment, read);
    const failure = await resolver.resolve(requested).catch((error: unknown) => error);
    expect(failure).toMatchObject({category: "MISSING_SECRET", message: "The AI provider credential is unavailable."});
    expect(String(failure)).not.toContain("fake-secret-must-not-escape");
    expect(String(failure)).not.toContain(requested);
  });

  it("does not log the reference or secret", async () => {
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")];
    const resolver = new EnvironmentAiCredentialSecretResolver(bindings, {TEST_GROQ_KEY: "fake-secret"});
    await resolver.resolve(reference);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
