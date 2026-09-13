import {readFileSync, readdirSync, statSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

import {AiProviderAdapterRegistry} from "@/features/ai-provider-gateway/infrastructure/adapters/ai-provider-adapter-registry";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("AI provider gateway boundaries", () => {
  it("keeps groq-sdk out of domain and application", () => {
    for (const layer of ["domain", "application"]) {
      const source = sourceFiles(`src/features/ai-provider-gateway/${layer}`).map((path) => readFileSync(path, "utf8")).join("\n");
      expect(source).not.toContain("groq-sdk");
    }
  });

  it("resolves explicit adapters and rejects duplicate keys", () => {
    const adapter = {adapterKey: "fake", execute: async () => ({content: "ok", finishReason: "STOP" as const})};
    const registry = new AiProviderAdapterRegistry([adapter]);
    expect(registry.resolve("fake")).toBe(adapter);
    expect(registry.resolve("unknown")).toBeNull();
    expect(() => new AiProviderAdapterRegistry([adapter, adapter])).toThrow("Duplicate AI provider adapter key.");
  });

  it("defines a content-free generated migration", () => {
    const migration = readFileSync("drizzle/0016_ai_provider_gateway.sql", "utf8");
    expect(migration).toContain('CREATE TABLE "ai_provider_runtime_health"');
    expect(migration).toContain("HALF_OPEN");
    for (const forbidden of ["prompt", "system_message", "customer_text", "generated_response", "api_key", "authorization", "request_payload", "response_payload"]) {
      expect(migration.toLowerCase()).not.toContain(forbidden);
    }
  });
});
