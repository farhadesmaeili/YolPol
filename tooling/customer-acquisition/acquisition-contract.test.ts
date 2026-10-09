import {execFileSync, spawnSync} from "node:child_process";
import {readFileSync, readdirSync} from "node:fs";
import {resolve, join} from "node:path";
import {describe, expect, it} from "vitest";
import {calculateMigrationFingerprint} from "../release/release-contract";
import {assertDisposableCompose, assertPrivatePostgresLogs} from "./run-disposable-validation.mjs";
import {parseObservation} from "../../src/features/customer-acquisition/infrastructure/validation/acquisition-input";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const workflow = JSON.parse(read("deploy/customer-acquisition/workflows/0082-synthetic-company-intake.json"));
const allowedNodes = ["n8n-nodes-base.manualTrigger", "n8n-nodes-base.set", "n8n-nodes-base.httpRequest"];

function validateWorkflow(value: typeof workflow) {
  expect(value.active).toBe(false);
  expect(value.nodes).toHaveLength(4);
  expect(value.nodes.map((node: {type: string}) => node.type)).toEqual([allowedNodes[0], allowedNodes[1], allowedNodes[2], allowedNodes[1]]);
  expect(value.nodes.every((node: {type: string}) => allowedNodes.includes(node.type))).toBe(true);
  const http = value.nodes[2];
  expect(http.parameters.url).toBe("http://customer-acquisition-api:8080/v1/observations");
  expect(http.parameters.method).toBe("POST");
  expect(http.parameters.options.timeout).toBe(8000);
  expect(http.parameters.options.redirect.redirect.followRedirects).toBe(false);
  expect(http.parameters.authentication).toBe("genericCredentialType");
  expect(http.parameters.genericAuthType).toBe("httpHeaderAuth");
  expect(http.parameters.sendHeaders).toBeUndefined();
  expect(http.parameters.headerParameters).toBeUndefined();
  expect(http.credentials).toEqual({httpHeaderAuth: {id: "AcquisitionInternal0082", name: "Acquisition Internal (file override)"}});
  for (const node of [value.nodes[0], value.nodes[1], value.nodes[3]]) expect(node.credentials).toBeUndefined();
  expect(http.retryOnFail).toBe(false);
  expect(value.connections).toEqual({
    "Manual Trigger": {main: [[{node: "Synthetic Observation", type: "main", index: 0}]]},
    "Synthetic Observation": {main: [[{node: "Acquisition API", type: "main", index: 0}]]},
    "Acquisition API": {main: [[{node: "Bounded Result", type: "main", index: 0}]]},
  });
  expect(parseObservation(JSON.parse(value.nodes[1].parameters.jsonOutput)).synthetic).toBe(true);
  expect(value.settings.executionTimeout).toBe(30);
  expect(value.settings.saveManualExecutions).toBe(false);
  expect(value.pinData).toEqual({});
  expect(JSON.stringify(value)).not.toMatch(/SMTP|IMAP|telegram|linkedin|GROQ|DATABASE_URL|\$env|Bearer |password|internal.?price|supplier.?cost|api.?key/iu);
  expect(JSON.parse(read("deploy/customer-acquisition/workflows/credential-reference.json"))[0].data).toEqual({});
}

describe("acquisition deployment boundaries", () => {
  it("ACQ-02 rejects leaked sentinels/details and requires observable database errors", () => {
    const sentinel = "synthetic-log-sentinel";
    const safe = 'ERROR:  duplicate key value violates unique constraint "privacy_email"\nERROR:  duplicate key value violates unique constraint "privacy_domain"';
    const constraints = ["privacy_email", "privacy_domain"];
    expect(() => assertPrivatePostgresLogs(safe, sentinel, constraints)).not.toThrow();
    for (const leaked of [`${sentinel}@example.test`, `${sentinel}.example`, "DETAIL: Key redacted", "STATEMENT: insert", "CONTEXT: SQL statement"]) {
      expect(() => assertPrivatePostgresLogs(`${safe}\n${leaked}`, sentinel, constraints)).toThrow("privacy check failed");
    }
    expect(() => assertPrivatePostgresLogs("", sentinel, constraints)).toThrow("error absent");
    expect(() => assertPrivatePostgresLogs(safe.split("\n")[0], sentinel, constraints)).toThrow("error absent");
  });
  it("refuses standalone n8n verification without disposable authorization before networking", () => {
    const result = spawnSync(process.execPath, [resolve("tooling/customer-acquisition/n8n-runtime-smoke.mjs")], {encoding: "utf8", env: {...process.env, ACQUISITION_DISPOSABLE_TEST: "false"}, timeout: 5000});
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("Disposable n8n server verification failed: disposable_guard");
  });
  it("validates inactive synthetic workflow against a positive node allow-list", () => validateWorkflow(workflow));
  it.each(["n8n-nodes-base.code", "n8n-nodes-base.executeCommand", "n8n-nodes-base.postgres", "n8n-nodes-base.telegram", "community.custom"])("rejects node %s", (type) => {
    const changed = structuredClone(workflow); changed.nodes[1].type = type;
    expect(() => validateWorkflow(changed)).toThrow();
  });
  it("preserves the exact pre-task main migration fingerprint", () => {
    expect(calculateMigrationFingerprint()).toEqual({latestMigration: "0024_phase_c2_live_acceptance", migrationSetSha256: "606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4"});
    expect(read("drizzle.config.ts")).not.toContain("customer-acquisition");
    expect(read("drizzle.customer-acquisition.config.ts")).toContain('out: "./drizzle-customer-acquisition"');
  });
  it("resolves explicit private Compose networks and secret/port boundaries", () => {
    const output = execFileSync("docker", ["compose", "-f", "deploy/customer-acquisition/compose.yaml", "--profile", "migration", "config", "--format", "json"], {encoding: "utf8", env: {...process.env, ACQUISITION_SECRET_DIRECTORY: resolve("deploy/customer-acquisition/secrets")}});
    const model = JSON.parse(output);
    expect(model.name).toBe("yolpol-acquisition-local");
    expect(Object.keys(model.networks).sort()).toEqual(["acquisition_database", "n8n_database", "orchestration"]);
    for (const network of Object.values(model.networks) as Array<{internal: boolean; external?: boolean}>) { expect(network.internal).toBe(true); expect(network.external).not.toBe(true); }
    const services = model.services;
    for (const name of ["acquisition-postgres", "n8n-postgres"]) {
      expect(services[name].command).toEqual(["postgres", "-c", "log_statement=none", "-c", "log_min_error_statement=panic", "-c", "log_parameter_max_length_on_error=0", "-c", "log_error_verbosity=terse"]);
    }
    expect(Object.keys(services.n8n.networks).sort()).toEqual(["n8n_database", "orchestration"]);
    expect(Object.keys(services["customer-acquisition-api"].networks).sort()).toEqual(["acquisition_database", "orchestration"]);
    expect(services.n8n.ports).toHaveLength(1);
    expect(services.n8n.ports[0]).toMatchObject({host_ip: "127.0.0.1", published: "5678", target: 5678});
    for (const name of ["acquisition-postgres", "n8n-postgres", "customer-acquisition-api", "migrate"]) expect(services[name].ports).toBeUndefined();
    expect(services.n8n.image).toBe("docker.n8n.io/n8nio/n8n:2.42.4@sha256:9c0862a08090c79122069e23131d27529c250b92e90c9d51a6ec406fe1527c4e");
    expect(JSON.parse(services.n8n.environment.NODES_INCLUDE)).toEqual(allowedNodes);
    expect(services.n8n.environment.N8N_COMMUNITY_PACKAGES_ENABLED).toBe("false");
    expect(services.n8n.environment.N8N_BLOCK_ENV_ACCESS_IN_NODE).toBe("true");
    expect(services.n8n.environment.CREDENTIALS_OVERWRITE_PERSISTENCE).toBe("false");
    expect(services.n8n.read_only).toBe(true);
    expect(services.n8n.cap_drop).toEqual(["ALL"]);
    expect(services.n8n.tmpfs).toContain("/home/node/.cache:size=64m,uid=1000,gid=1000,mode=0700");
    expect(services.n8n.secrets.map((secret: {source: string}) => secret.source).sort()).toEqual(["n8n_credential_overwrites", "n8n_database_password", "n8n_encryption_key"]);
    expect(services["customer-acquisition-api"].secrets.map((secret: {source: string}) => secret.source).sort()).toEqual(["acquisition_api_token", "acquisition_runtime_password"]);
    expect(services.migrate.secrets.map((secret: {source: string}) => secret.source)).toEqual(["acquisition_migrator_password"]);
    expect(services.migrate.profiles).toEqual(["migration"]);
    expect(JSON.stringify(services.n8n.environment)).not.toMatch(/TELEGRAM|GROQ|SMTP|IMAP|DATABASE_URL|acquisition.*password/iu);
  });
  it("resolves a separate disposable project with no volume or host-port exposure", () => {
    const project = `yolpol-acq-test-${"a".repeat(32)}`;
    const model = JSON.parse(execFileSync("docker", ["compose", "-p", project, "-f", "deploy/customer-acquisition/compose.yaml", "-f", "deploy/customer-acquisition/compose.validation.yaml", "--profile", "migration", "--profile", "validation", "config", "--format", "json"], {encoding: "utf8", env: {...process.env, ACQUISITION_SECRET_DIRECTORY: resolve("deploy/customer-acquisition/secrets")}}));
    expect(() => assertDisposableCompose(model, project)).not.toThrow();
    model.services["acquisition-postgres"].volumes.push({type: "volume", source: "existing-volume"});
    expect(() => assertDisposableCompose(model, project)).toThrow();
  });
  it("keeps layer dependency directions and public application composition separate", () => {
    const root = resolve("src/features/customer-acquisition");
    const files = (directory: string): string[] => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => entry.isDirectory() ? entry.name === "__tests__" ? [] : files(join(directory, entry.name)) : [join(directory, entry.name)]);
    for (const layer of ["domain", "application", "presentation"]) for (const file of files(join(root, layer))) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from ["'][^"']*\/(infrastructure|testing)\//u);
      if (layer === "domain") expect(source).not.toMatch(/from ["'](?:node:|pg|drizzle|next|react|[^"']*\/application\/)/u);
    }
    for (const file of files(resolve("src/app"))) if (/\.[tj]sx?$/u.test(file)) expect(readFileSync(file, "utf8")).not.toContain("customer-acquisition");
  });
});
