import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const ingressDirectory = resolve(repositoryRoot, "deploy/ingress");
const composePath = resolve(ingressDirectory, "compose.yaml");
const runtimePath = resolve(ingressDirectory, "runtime.env.example");
const compose = readFileSync(composePath, "utf8");
const caddyfile = readFileSync(resolve(ingressDirectory, "Caddyfile"), "utf8");
const runtime = readFileSync(runtimePath, "utf8");
const stagingCompose = readFileSync(resolve(repositoryRoot, "deploy/staging/compose.yaml"), "utf8");
const productionCompose = readFileSync(resolve(repositoryRoot, "deploy/production/compose.yaml"), "utf8");
const wrapperPath = resolve(repositoryRoot, "deploy/operations/yolpol-deploy");
const wrapper = readFileSync(wrapperPath, "utf8");

function shellPath(path: string): string {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

function serviceBlock(source: string, service: string): string {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) throw new Error(`Missing ${service} service.`);
  const end = lines.findIndex((line, index) => index > start && /^  [a-z][a-z0-9-]*:$/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

function runShell(...args: readonly string[]) {
  const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\sh.exe" : "/bin/sh";
  return spawnSync(shell, args, {encoding: "utf8", timeout: 10_000});
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}

function runResolvedPolicy(model: unknown) {
  const executable = process.platform === "win32" ? "python" : "python3";
  return spawnSync(executable, [resolve(repositoryRoot, "tooling/deployment/resolved-compose-policy-check.py"), "ingress"], {
    encoding: "utf8",
    input: JSON.stringify(model),
    timeout: 20_000,
  });
}

const dockerComposeAvailable = spawnSync("docker", ["compose", "version"], {encoding: "utf8", timeout: 10_000}).status === 0;
const dockerIt = dockerComposeAvailable ? it : it.skip;

describe("shared host ingress contract", () => {
  it("fixes one release-independent ingress project as the steady-state 80/443 owner", () => {
    expect(compose).toContain("name: yolpol-ingress");
    expect(compose).toContain('0.0.0.0:80:80');
    expect(compose).toContain('0.0.0.0:443:443');
    expect(compose).toContain('0.0.0.0:443:443/udp');
    expect(productionCompose).not.toContain("ports:");
    expect(productionCompose).not.toMatch(/^  edge:$/mu);
    expect(stagingCompose).toContain('profiles: ["legacy-staging-edge-migration"]');
    expect(stagingCompose.match(/^\s+ports:$/gmu)).toHaveLength(1);
    expect(runtime).not.toMatch(/YOLPOL_(?:GIT_REVISION|WEB_IMAGE|WORKER_IMAGE|MIGRATION_IMAGE)/u);
    expect(compose).not.toMatch(/ghcr\.io\/farhadesmaeili\/yolpol-/u);
  });

  it("routes each hostname only to its stable environment alias and preserves the request URI", () => {
    expect(caddyfile).toMatch(/staging\.yolpol\.com \{\s+reverse_proxy staging-web:3000\s+\}/u);
    expect(caddyfile).toMatch(/yolpol\.com \{\s+reverse_proxy production-web:3000\s+\}/u);
    expect(caddyfile).toMatch(/www\.yolpol\.com \{\s+redir https:\/\/yolpol\.com\{uri\} permanent\s+\}/u);
    expect(caddyfile).not.toContain("reverse_proxy web:3000");
    expect(caddyfile).not.toContain("redir https://yolpol.com{uri} permanent\n}\n\nstaging.yolpol.com");
  });

  it("uses two fixed external ingress networks without attaching backend services or secrets", () => {
    expect(compose).toContain("name: yolpol-staging-ingress");
    expect(compose).toContain("name: yolpol-production-ingress");
    expect(stagingCompose).toContain("name: yolpol-staging-ingress");
    expect(stagingCompose).toContain("- staging-web");
    expect(productionCompose).toContain("name: yolpol-production-ingress");
    expect(productionCompose).toContain("- production-web");
    expect(serviceBlock(stagingCompose, "web")).toContain("- staging-web");
    expect(serviceBlock(stagingCompose, "web")).not.toContain("production-web");
    expect(serviceBlock(productionCompose, "web")).toContain("- production-web");
    expect(serviceBlock(productionCompose, "web")).not.toContain("staging-web");
    for (const service of ["postgres", "inquiry-notifications", "conversation-translation", "conversation-ai-fallback"]) {
      expect(serviceBlock(stagingCompose, service)).not.toContain("production_ingress");
      expect(serviceBlock(stagingCompose, service)).not.toContain("yolpol-production-ingress");
      expect(serviceBlock(productionCompose, service)).not.toContain("staging_ingress");
      expect(serviceBlock(productionCompose, service)).not.toContain("yolpol-staging-ingress");
    }
    expect(compose).not.toMatch(/backend|postgres|worker|secret|docker\.sock|network_mode:\s*host/u);
    expect(compose).not.toMatch(/privileged:|devices:/u);
    expect(compose).toContain("cap_drop:\n      - ALL");
    expect(compose).toContain("cap_add:\n      - NET_BIND_SERVICE");
    expect(compose).toContain("read_only: true");
  });

  it("keeps the wrapper grammar closed and removes unattended legacy/local edge activation", () => {
    expect(wrapper).toContain("INGRESS_COMPOSE=/opt/yolpol/ingress/compose.yaml");
    expect(wrapper).toContain("-p yolpol-ingress");
    expect(wrapper).not.toMatch(/ingress_compose up|staging_compose up .*\bedge\b/u);
    for (const command of ["deploy-edge", "production-deploy-edge", "ingress-deploy"]) {
      const result = runShell(shellPath(wrapperPath), command);
      expect(result.status).toBe(64);
      expect(result.stderr).toContain("unknown command");
    }
    for (const command of ["ingress-validate", "ingress-status", "ingress-health", "ingress-health-production"]) {
      const result = runShell(shellPath(wrapperPath), command, "unexpected");
      expect(result.status).toBe(64);
      expect(result.stderr).toContain("unexpected arguments");
    }
    for (const invocation of [
      ["ingress-status", "--project-directory", "/tmp/evil"],
      ["ingress-health", "--network", "attacker"],
      ["ingress-validate", "production"],
    ]) {
      expect(runShell(shellPath(wrapperPath), ...invocation).status).toBe(64);
    }
  }, 20_000);

  dockerIt("resolves and passes the closed ingress policy while rejecting adversarial mutations", () => {
    const result = spawnSync("docker", [
      "compose", "-p", "yolpol-ingress", "--project-directory", ingressDirectory,
      "--env-file", runtimePath, "-f", composePath, "config", "--format", "json",
    ], {cwd: repositoryRoot, encoding: "utf8", maxBuffer: 4_000_000, timeout: 20_000});
    expect(result.status, result.stderr).toBe(0);
    const model: unknown = JSON.parse(result.stdout);
    expect(runResolvedPolicy(model).status).toBe(0);

    const attacks: Array<(value: Record<string, unknown>) => void> = [
      (value) => { value.name = "attacker"; },
      (value) => { requireObject(requireObject(value.services).ingress).privileged = true; },
      (value) => { requireObject(requireObject(value.services).ingress).cap_add = ["NET_ADMIN"]; },
      (value) => { requireObject(requireObject(value.services).ingress).ports = []; },
      (value) => { requireObject(requireObject(value.services).ingress).networks = {staging_ingress: null}; },
      (value) => { requireObject(requireObject(value.networks).staging_ingress).name = "yolpol-production-ingress"; },
      (value) => { requireObject(requireObject(value.services).ingress).volumes = [{type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock", read_only: true}]; },
      (value) => { requireObject(requireObject(value.services).ingress).environment = {DATABASE_URL: "secret"}; },
      (value) => { requireObject(requireObject(value.services).ingress).image = "caddy:latest"; },
    ];
    for (const attack of attacks) {
      const attacked = structuredClone(requireObject(model));
      attack(attacked);
      expect(runResolvedPolicy(attacked).status).toBe(1);
    }
  }, 30_000);
});
