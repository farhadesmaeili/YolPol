import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {afterEach, describe, expect, it, vi} from "vitest";

import {
  createEnvelope,
  createIntentBody,
  deploymentAudiencePrefix,
  intentDigest,
  maximumIntentBytes,
  waitForDeployment,
  type IntentInput,
} from "./release-deployment";

const root = resolve(import.meta.dirname, "../..");

function input(): IntentInput {
  return {
    repository: "farhadesmaeili/YolPol",
    repositoryId: "123456789012345678",
    repositoryOwner: "farhadesmaeili",
    repositoryOwnerId: "987654321098765432",
    environment: "staging",
    releaseTag: "v0.1.7",
    gitSha: "a".repeat(40),
    manifestSha256: "b".repeat(64),
    workflowRunId: "123456789012345678",
    workflowRunAttempt: 1,
    workflowRef: "farhadesmaeili/YolPol/.github/workflows/release.yml@refs/tags/v0.1.7",
    workflowSha: "a".repeat(40),
    jobWorkflowRef: "farhadesmaeili/YolPol/.github/workflows/deploy-release.yml@refs/tags/v0.1.7",
    jobWorkflowSha: "a".repeat(40),
    eventName: "push",
    ref: "refs/tags/v0.1.7",
    issuedAtUnix: 1_780_000_000,
    expiresAtUnix: 1_780_000_300,
    nonce: "c".repeat(43),
    capability: {
      type: "github-actions-token",
      keyId: "staging-2026-01",
      algorithm: "rsa-oaep-sha256",
      ciphertext: "d".repeat(512),
    },
  };
}

describe("authenticated deployment intent", () => {
  it("hashes and transports the exact one-time compact bytes", () => {
    const body = createIntentBody(input());
    expect(body.toString("utf8")).toBe(JSON.stringify(JSON.parse(body.toString("utf8"))));
    expect(body.at(-1)).not.toBe(0x0a);
    expect(body.length).toBeLessThan(maximumIntentBytes);
    const digest = intentDigest(body);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(`${deploymentAudiencePrefix}${digest}`).toBe(`yolpol-release-v1:${digest}`);
    const envelope = createEnvelope(body, `${"e".repeat(20)}.${"f".repeat(20)}.${"g".repeat(20)}`);
    expect(Buffer.from(envelope.intentBody, "base64url")).toEqual(body);
  });

  it("never places the JWT or Deployment ID in the authenticated body", () => {
    const body = JSON.parse(createIntentBody(input()).toString("utf8")) as Record<string, unknown>;
    expect(body).not.toHaveProperty("oidcJwt");
    expect(body).not.toHaveProperty("deploymentId");
    expect(Object.keys(body)).toEqual([
      "protocolVersion", "operation", "repository", "repositoryId", "repositoryOwner", "repositoryOwnerId",
      "environment", "releaseTag", "gitSha", "manifestSha256", "workflowRunId", "workflowRunAttempt",
      "workflowRef", "workflowSha", "jobWorkflowRef", "jobWorkflowSha", "eventName", "ref",
      "issuedAtUnix", "expiresAtUnix", "nonce", "capability",
    ]);
  });

  it("rejects malformed identifiers, timestamps, and capability metadata", () => {
    expect(() => createIntentBody({...input(), repositoryId: "1e3"})).toThrow(/repositoryId/u);
    expect(() => createIntentBody({...input(), expiresAtUnix: input().issuedAtUnix + 301})).toThrow(/lifetime/u);
    expect(() => createIntentBody({...input(), nonce: "short"})).toThrow(/nonce/u);
    expect(() => createIntentBody({...input(), capability: {...input().capability, keyId: "space rejected"}})).toThrow(/keyId/u);
  });
});

describe("deployment result diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the deployment ID and bounded host failure description", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      state: "failure",
      description: "staging deployment failed at public-smoke-staging; previous runtime restored",
    }]), {status: 200})));

    await expect(waitForDeployment("farhadesmaeili/YolPol", "token", 6619957147)).rejects.toThrow(
      "Host deployment 6619957147 ended with failure: "
      + "staging deployment failed at public-smoke-staging; previous runtime restored.",
    );
  });

  it("reports an exact whitelisted host policy result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      state: "error",
      description: "PHASE_C2_OFFSERVER_BACKUP_REQUIRED",
    }]), {status: 200})));

    await expect(waitForDeployment("farhadesmaeili/YolPol", "token", 6619957147)).rejects.toThrow(
      "Host deployment 6619957147 ended with error: PHASE_C2_OFFSERVER_BACKUP_REQUIRED.",
    );
  });

  it("does not echo malformed status descriptions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      state: "failure",
      description: "untrusted printable workflow output",
    }]), {status: 200})));

    await expect(waitForDeployment("farhadesmaeili/YolPol", "token", 123)).rejects.toThrow(
      "Host deployment 123 ended with failure.",
    );
  });

  it("does not echo a valid-shaped transaction description with an unknown stage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      state: "failure",
      description: "deployment failed at credential-shaped-value; failed before activation",
    }]), {status: 200})));

    await expect(waitForDeployment("farhadesmaeili/YolPol", "token", 124)).rejects.toThrow(
      "Host deployment 124 ended with failure.",
    );
  });
});

describe("Phase C1 workflow contract", () => {
  const release = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
  const reusable = readFileSync(resolve(root, ".github/workflows/deploy-release.yml"), "utf8");
  const production = readFileSync(resolve(root, ".github/workflows/promote-production.yml"), "utf8");
  const controller = readFileSync(resolve(root, "deploy/control-plane/yolpol-release-controller.py"), "utf8");
  const internal = readFileSync(resolve(root, "deploy/operations/yolpol-deploy-internal"), "utf8");
  const wrapper = readFileSync(resolve(root, "deploy/operations/yolpol-deploy"), "utf8");
  const agent = readFileSync(resolve(root, "deploy/control-plane/yolpol-deployment-agent.py"), "utf8");
  const protocol = readFileSync(resolve(root, "deploy/control-plane/yolpol_control_plane.py"), "utf8");
  const bootstrap = readFileSync(resolve(root, "deploy/bootstrap/yolpol-bootstrap.py"), "utf8");
  const operatorSudoers = readFileSync(resolve(root, "deploy/operations/sudoers.yolpol-deploy"), "utf8");
  const agentSudoers = readFileSync(resolve(root, "deploy/control-plane/sudoers.yolpol-deployment-agent"), "utf8");
  const agentService = readFileSync(resolve(root, "deploy/control-plane/yolpol-deployment-agent.service"), "utf8");

  it("automates Staging only after publication and leaves Production explicit", () => {
    expect(release).toContain("needs: [validate, release]");
    expect(release).toContain("environment: staging");
    expect(release).not.toContain("environment: production");
    expect(production).toContain("workflow_dispatch:");
    expect(production).toContain("environment: production");
    expect(production).not.toMatch(/on:\s*\n\s*(?:push|release):/u);
  });

  it("uses environment approval without an implicit Deployment and exact permissions", () => {
    expect(reusable).toContain("deployment: false");
    for (const permission of ["contents: read", "packages: read", "deployments: write", "id-token: write"]) {
      expect(reusable).toContain(permission);
    }
    expect(reusable).not.toMatch(/write-all|actions:\s*write|administration:/u);
    expect(reusable).not.toMatch(/APP_DATABASE|TELEGRAM|GROQ|OPENAI|SMTP/u);
  });

  it("holds one wrapper lock and never recursively invokes the public wrapper", () => {
    expect(wrapper).toContain('exec 9>>"$LOCK_FILE"');
    expect(wrapper).toContain("apply-staging-intent) /usr/bin/python3");
    expect(controller).not.toContain('"/opt/yolpol/bin/yolpol-deploy"');
    expect(controller).toContain("YOLPOL_INTERNAL_LOCK_FD");
    expect(internal).toContain("internal lock identity rejected");
  });

  it("limits monitoring authority and Production migrations", () => {
    expect(internal).toContain("monitoring_compose up -d --no-build --no-deps operations-exporter");
    expect(internal).toContain("monitoring_compose pull operations-exporter");
    expect(internal).not.toContain("monitoring_compose pull ;;");
    expect(internal).not.toMatch(/monitoring_compose up[^\n]*(?:prometheus|alertmanager|cadvisor|node-exporter|postgres-exporter|blackbox-exporter)/u);
    expect(controller).toContain("PHASE_C2_OFFSERVER_BACKUP_REQUIRED");
    expect(controller).not.toContain('internal("migrate-production")');
  });

  it("uses fixed Staging public smoke routes and no caller URL", () => {
    expect(internal).toContain("/api/health/live /api/health/ready /en");
    expect(internal).toContain("https://staging.yolpol.com$route");
    expect(internal).toContain("x-robots-tag: noindex, nofollow, noarchive");
    expect(internal).toContain("/usr/bin/tr -d '\\r'");
    expect(internal).toContain("/usr/bin/grep -Fxiq 'x-robots-tag: noindex, nofollow, noarchive'");
    expect(internal).not.toContain("noarchive\\r?$");
  });

  it("keeps GitHub App polling read-only, conditional, fixed, and PAT-free", () => {
    expect(protocol).toContain('f"{self.API_ROOT}/repos/{owner}/{repository}/deployments?{query}"');
    expect(protocol).toContain('headers["If-None-Match"] = etag');
    expect(protocol).toContain("/app/installations/{self.config.installation_id}/access_tokens");
    expect(protocol).toContain('"repository_ids": [int(self.config.repository_id)]');
    expect(protocol).toContain('"permissions": {"deployments": "read"}');
    expect(protocol).toContain('permissions.get("deployments") != "read"');
    expect(agent).toContain('for environment in ("staging", "production")');
    expect(agent).toContain("LOCK_EX | fcntl.LOCK_NB");
    expect(agent).toContain("CONTROLLER_TERMINAL_REJECT_EXIT");
    expect(agent).toContain("retryable_found = True");
    expect(agent).toContain("if not retryable_found and candidate_etag is not None:");
    expect(agent.indexOf('state["etags"][environment] = candidate_etag')).toBeGreaterThan(
      agent.indexOf("invoke_controller(deployment, environment)"),
    );
    expect(`${agent}\n${protocol}`).not.toMatch(/personal[_ -]?access|\bPAT\b|deployments\/.*(?:POST|PATCH|DELETE)/iu);
  });

  it("uses temporary registry auth and always removes its request directory", () => {
    expect(controller).toContain('RUN_ROOT = Path("/run/yolpol-deployment")');
    expect(controller).toContain('"--password-stdin"');
    expect(controller).toContain('docker_auth(token, str(claims["actor"]))');
    expect(controller).not.toContain('"--username", "github-actions"');
    expect(controller).toContain("shutil.rmtree(request_root, ignore_errors=True)");
    expect(controller).not.toContain('DOCKER_CONFIG=/root/.docker');
    expect(internal).toContain("/run/yolpol-deployment/request-*/docker");
  });

  it("validates optional JOSE x5t plus the signed actor identity", () => {
    expect(protocol).toContain('{"alg", "typ", "kid", "x5t", "crit"}');
    expect(protocol).toContain("hashlib.sha1(certificate, usedforsecurity=False).digest()");
    expect(protocol).toContain('actor = require_actor(claims.get("actor"))');
    expect(protocol).toContain('require_decimal(claims.get("actor_id"), "OIDC actor_id")');
  });

  it("blocks environment-wide database uncertainty and crash reconciliation", () => {
    expect(controller).toContain("environment_records = [");
    expect(controller).toContain("requires_manual_database_review(record) for record in environment_records");
    expect(controller).toContain("requires_manual_deployment_reconciliation(record) for record in environment_records");
    expect(controller).toContain("MANUAL_DEPLOYMENT_RECONCILIATION_REQUIRED");
  });

  it("exposes only root-actor Staging pre-mutation reconciliation", () => {
    expect(wrapper).toContain("reconcile-staging-pre-mutation <deployment-id>");
    expect(wrapper).toContain("validate_deployment_id()");
    expect(wrapper).toContain("ROOT_INCIDENT_ONLY=true");
    expect(wrapper).toContain('[ "$ROOT_INCIDENT_ONLY" = true ] && [ "$ACTOR" != root ]');
    expect(wrapper).toContain(
      'reconcile-staging-pre-mutation) /usr/bin/python3 -B "$RELEASE_CONTROLLER" reconcile-pre-mutation staging "$DEPLOYMENT_ID"',
    );
    expect(controller).toContain('["reconcile-pre-mutation", "staging"]');
    expect(controller).toContain("PRE_MUTATION_CRASH_RECONCILED");
    expect(controller).toContain("os.path.lexists(journal)");
    expect(agent).not.toContain("reconcile-pre-mutation");
    expect(operatorSudoers.split(/\r?\n/u).filter((line) => line.includes("NOPASSWD"))).toEqual([
      "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy",
    ]);
    expect(agentSudoers).not.toContain("reconcile");
  });

  it("runs the complete local backup gate before changed Staging migration", () => {
    const backup = internal.indexOf("backup_gate()");
    const create = internal.indexOf("backup-create", backup);
    const integrity = internal.indexOf("backup-verify verify", create);
    const deep = internal.indexOf("backup-deep-verify deep-verify", integrity);
    const throttle = internal.indexOf('/usr/bin/touch "$LAST_BACKUP_FILE"', deep);
    expect(backup).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(backup);
    expect(integrity).toBeGreaterThan(create);
    expect(deep).toBeGreaterThan(integrity);
    expect(throttle).toBeGreaterThan(deep);
    expect(controller.indexOf('run("backup-create-verify-deep-staging")')).toBeLessThan(controller.indexOf('run("migrate-staging",'));
  });

  it("installs but never activates the isolated deployment agent", () => {
    expect(bootstrap).toContain('AGENT_NAME = "yolpol-deployment-agent"');
    expect(bootstrap).toContain("exact_agent_sudo_commands");
    expect(bootstrap).toContain('set(tags) != {"NOPASSWD", "NOSETENV"}');
    expect(bootstrap).toContain('"--shell", "/usr/sbin/nologin"');
    expect(bootstrap).toContain("set(group_ids) != {AGENT_GID}");
    expect(bootstrap).not.toMatch(/systemctl[^\n]*(?:enable|start)[^\n]*yolpol-deployment-agent/iu);
    expect(bootstrap).not.toMatch(/openssl[^\n]*(?:genrsa|genpkey)|ssh-keygen/iu);
    expect(agentSudoers.split(/\r?\n/u).filter((line) => line.includes("NOPASSWD"))).toEqual([
      "yolpol-deployment-agent ALL=(root) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy apply-staging-intent, /opt/yolpol/bin/yolpol-deploy apply-production-intent",
    ]);
    expect(agentService).not.toContain("NoNewPrivileges=yes");
    expect(agentService).not.toContain("CapabilityBoundingSet=");
    expect(agentService).toContain("ReadWritePaths=/opt/yolpol /run /var/lib/yolpol-deployment-agent");
    expect(agentService).toContain("TimeoutStartSec=82min");
  });

  it("does not expose Production cutover or infrastructure mutation", () => {
    expect(controller).toContain("deployed-not-publicly-activated");
    expect(controller).not.toMatch(/cloudflare|dns|deploy-operations-exporter-production|production.*monitoring/iu);
    expect(controller).not.toContain('internal("migrate-production")');
  });
});
