import {readFileSync, readdirSync} from "node:fs";
import {join, resolve} from "node:path";
import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {buildSync} from "esbuild";
import {runtimeDiscoverySourceRegistry} from "../../src/features/customer-acquisition/infrastructure/config/discovery-source-registry";
import {assertDiscoveryPolicy} from "../../src/features/customer-acquisition/domain/services/discovery-source-policy";
const read = (path: string) => readFileSync(resolve(path), "utf8");
describe("discovery architecture boundaries", () => {
  it("excludes test approval code from the actual API bundle", () => {
    const bundle = buildSync({entryPoints: [resolve("tooling/customer-acquisition/api.ts")], bundle: true, platform: "node", target: "node22", format: "cjs", external: ["pg-native"], write: false, metafile: true});
    expect(Object.keys(bundle.metafile!.inputs).some(path => /(?:testing|__tests__|fixture)/i.test(path))).toBe(false);
    expect(bundle.outputFiles[0].text).not.toContain('status: "APPROVED", method: "SYNTHETIC_FIXTURE"');
  });
  it("has no approved runtime or fixture policy", () => {
    for (const key of ["ege-exporters", "tobb-registry", "official-company-websites", "synthetic-fixture", "unknown"]) {
      expect(() => assertDiscoveryPolicy(runtimeDiscoverySourceRegistry.find(key, key === "synthetic-fixture" ? "fixture-1" : "review-1"), new Date())).toThrow();
    }
    const composition = read("src/composition/customer-acquisition/customer-acquisition-service.ts");
    expect(composition).toContain("new PostgresDiscoveryRepository(discoveryPools, runtimeDiscoverySourceRegistry)");
    expect(composition).not.toMatch(/fixture|testing|ALLOW_DISCOVERY|ENABLE_DISCOVERY/);
  });
  it("keeps production discovery code free of fixture imports, network adapters and canonical writes", () => {
    const files = (path: string): string[] => readdirSync(path, {withFileTypes: true}).flatMap(e => e.isDirectory() ? ["testing", "__tests__"].includes(e.name) ? [] : files(join(path, e.name)) : [join(path, e.name)]);
    for (const file of files(resolve("src/features/customer-acquisition")).filter(f => f.includes("discovery"))) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\/testing\/|fixtureRegistry|fixturePolicy|fetch\(|https?\.request|groq|telegram|smtp/i);
    }
    const repository = read("src/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-discovery-repository.ts");
    expect(repository).not.toContain("postgres-acquisition-repository");
    expect(repository).not.toMatch(/(?:insert|update|delete)\(\s*(?:companies|domains|leads|contacts|sourceIdentities|suppressions)/);
  });
  it("preserves the initial acquisition migration exactly", () => {
    const bytes = readFileSync(resolve("drizzle-customer-acquisition/0000_customer_acquisition_foundation.sql"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("a8ff15794951aa5103f3409d86ddd3bf4f59e909a38998e13f7e1f2702e650e4");
  });
  it("leaves normal deployment without discovery credentials or test injection", () => {
    const compose = read("deploy/customer-acquisition/compose.yaml");
    expect(compose).not.toMatch(/DISCOVERY|fixture/i);
    expect(read("deploy/customer-acquisition/Dockerfile")).toContain("/compiled/api.cjs");
    expect(read(".github/workflows/ci.yml")).toContain("pnpm test:acquisition:disposable");
  });
});
