import {spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const bootstrapPath = resolve(repositoryRoot, "deploy/bootstrap/yolpol-bootstrap.py");
const bootstrap = readFileSync(bootstrapPath, "utf8");
const sudoers = readFileSync(resolve(repositoryRoot, "deploy/operations/sudoers.yolpol-deploy"), "utf8");
const ci = readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
const dockerComposeAvailable = spawnSync("docker", ["compose", "version"], {encoding: "utf8", timeout: 10_000}).status === 0;
const dockerIt = dockerComposeAvailable ? it : it.skip;

function runPython(...args: readonly string[]) {
  const executable = process.platform === "win32" ? "python" : "python3";
  return spawnSync(executable, args, {encoding: "utf8", timeout: 20_000});
}

describe("server bootstrap automation", () => {
  it("is valid Python and exposes only a closed command grammar", () => {
    const result = runPython(
      "-c",
      "import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))",
      bootstrapPath,
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);

    for (const command of [
      "check", "check-staging", "check-production", "check-ingress", "check-monitoring",
      "apply", "refresh-contracts", "runtime-install", "secret-install", "secret-rotate", "release-promote",
    ]) {
      expect(bootstrap).toContain(`\"${command}\"`);
    }
    expect(bootstrap).not.toContain("recovery-secret-install");
    expect(bootstrap).not.toContain("recovery-secret-rotate");
    expect(bootstrap).not.toMatch(/eval\(|shell=True|os\.system|subprocess\.(?:call|Popen).*shell/u);
  });

  it("supports exactly Debian 12/bookworm and Ubuntu 24.04/noble on Linux x86_64 / Docker amd64", () => {
    expect(bootstrap).toContain('SupportedHost("debian", "12", "bookworm", "https://download.docker.com/linux/debian")');
    expect(bootstrap).toContain('SupportedHost("ubuntu", "24.04", "noble", "https://download.docker.com/linux/ubuntu")');
    expect(bootstrap.match(/SupportedHost\(/gu)).toHaveLength(2);
    expect(bootstrap).toContain('SUPPORTED_ARCHITECTURE = "x86_64"');
    expect(bootstrap).not.toMatch(/ID_LIKE/u);
  });

  it("preserves the operator/container identity split", () => {
    expect(bootstrap).toContain("OPERATOR_UID = 1001");
    expect(bootstrap).toContain("OPERATOR_GID = 1001");
    expect(bootstrap).toContain("CONTAINER_UID = 10001");
    expect(bootstrap).toContain("CONTAINER_GID = 10001");
    expect(bootstrap).toContain("PRIVILEGED_GROUP_NAMES");
    expect(bootstrap).toContain("operator has broader sudo privilege");
    expect(bootstrap).toContain('set(tags) == {"NOPASSWD", "NOSETENV"}');
    expect(bootstrap).toContain('remainder == "/opt/yolpol/bin/yolpol-deploy"');
    expect(bootstrap).toContain("container UID 10001 must not identify a host user");
  });

  it("installs only the reviewed fixed host contracts", () => {
    for (const source of [
      "deploy/operations/yolpol-deploy",
      "deploy/operations/yolpol-deploy-policy.py",
      "deploy/operations/logrotate.yolpol-deploy",
      "deploy/staging/compose.yaml",
      "deploy/production/compose.yaml",
      "deploy/ingress/compose.yaml",
      "deploy/monitoring/compose.yaml",
      "deploy/monitoring/prometheus/prometheus.yml",
      "deploy/monitoring/alertmanager/alertmanager.local.yml",
      "deploy/monitoring/blackbox/blackbox.yml",
    ]) {
      expect(bootstrap).toContain(source);
    }
    expect(bootstrap).not.toMatch(/copytree|glob\(|rglob\(|shutil\.copy/u);
    expect(bootstrap).toContain('TRUSTED_SOURCE_ROOT = Path("/root/yolpol-bootstrap-source")');
    expect(bootstrap).toContain("apply and refresh-contracts require the fixed trusted source command");
    expect(bootstrap).toContain('SUDOERS_DESTINATION = Path("/etc/sudoers.d/yolpol-deploy")');
    expect(bootstrap).toContain('AGENT_SUDOERS_DESTINATION = Path("/etc/sudoers.d/yolpol-deployment-agent")');
    expect(bootstrap.match(/"\/usr\/sbin\/visudo", "-cf"/gu)).toHaveLength(6);
  });

  it("keeps runtime, secrets, and release authorities closed and separated", () => {
    expect(bootstrap).toContain('"staging": HOST_ROOT / "staging/runtime.env"');
    expect(bootstrap).toContain('"production": HOST_ROOT / "production/runtime.env"');
    expect(bootstrap).toContain('"ingress": HOST_ROOT / "ingress/runtime.env"');
    expect(bootstrap).toContain('"monitoring": HOST_ROOT / "monitoring/runtime.env"');
    expect(bootstrap).toContain('directory = HOST_ROOT / f"releases/{environment}/active"');
    expect(bootstrap).toContain("exchange_directories(staged, active)");
    expect(bootstrap).toContain("preflight_managed_destination(");
    expect(bootstrap).toContain("release promotion requires manifest on fd 3 and checksum on fd 4");
    expect(bootstrap).toContain("existing secret differs; use the explicit rotation command");
    expect(bootstrap).toContain('set(payload) != {"schemaVersion", "environment", "secrets"}');
    expect(bootstrap).not.toMatch(/print\([^\n]*(?:secret|payload|content|value)/iu);
  });

  it("creates only the two fixed bridge networks and starts no service", () => {
    expect(bootstrap).toContain('(\"yolpol-staging-ingress\", \"yolpol-production-ingress\")');
    expect(bootstrap).toContain('["/usr/bin/docker", "network", "create", "--driver", "bridge", name]');
    expect(bootstrap).not.toMatch(/network", "rm|volume", "rm|compose", "up|compose up|docker compose/u);
    expect(bootstrap.toLowerCase()).not.toContain("cloudflare");
  });

  it("does not broaden the existing sudo surface or release workflow", () => {
    const grants = sudoers.split(/\r?\n/u).filter((line) => line && !line.startsWith("Defaults"));
    expect(grants).toEqual([
      "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy",
    ]);
    expect(sudoers).not.toContain("yolpol-bootstrap");
    expect(ci).toContain("pnpm test:bootstrap");
  });

  dockerIt("records Docker Compose env_file behavior for accepted and rejected special characters", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "yolpol-bootstrap-env-file-"));
    try {
      const composePath = join(temporaryDirectory, "compose.yaml");
      const envPath = join(temporaryDirectory, "edge.env");
      writeFileSync(composePath, [
        "services:",
        "  probe:",
        "    image: busybox:1.36",
        "    env_file:",
        "      - edge.env",
        "",
      ].join("\n"));
      const safeUrl = "postgresql://user:p%24%23%20%5C%22%27@postgres:5432/yolpol?x=a=b&sslmode=require";
      writeFileSync(envPath, [
        `DATABASE_URL=${safeUrl}`,
        "DOLLAR=has$YOLPOL_COMPOSE_UNSET_VALUE",
        "HASH=has #hash",
        "EQUAL=has=equals",
        "SPACE=has space",
        String.raw`BACKSLASH=has\backslash`,
        'DOUBLE=has"quote',
        "SINGLE=has'quote",
        "",
      ].join("\n"));

      const result = spawnSync("docker", [
        "compose", "-p", "yolpol-bootstrap-env-file", "--project-directory", temporaryDirectory,
        "-f", composePath, "config", "--format", "json",
      ], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {...process.env, YOLPOL_COMPOSE_UNSET_VALUE: undefined},
        maxBuffer: 1_000_000,
        timeout: 20_000,
      });
      expect(result.status, result.stderr).toBe(0);
      const model = JSON.parse(result.stdout) as {services: {probe: {environment: Record<string, string>}}};
      expect(model.services.probe.environment).toEqual({
        BACKSLASH: String.raw`has\backslash`,
        DATABASE_URL: safeUrl,
        DOLLAR: "has",
        DOUBLE: 'has"quote',
        EQUAL: "has=equals",
        HASH: "has",
        SINGLE: "has'quote",
        SPACE: "has space",
      });
    } finally {
      rmSync(temporaryDirectory, {force: true, recursive: true});
    }
  });
});
