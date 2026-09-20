import {createHash, publicEncrypt, randomBytes, constants} from "node:crypto";
import {appendFileSync} from "node:fs";

import {manifestSha256, parseReleaseManifest} from "../release/release-contract";

export const deploymentProtocolVersion = 1 as const;
export const deploymentTask = "yolpol-release-v1" as const;
export const deploymentDescription = "YOLPOL authenticated release deployment" as const;
export const deploymentAudiencePrefix = "yolpol-release-v1:" as const;
export const deploymentOperation = "deploy-release" as const;
export const maximumIntentBytes = 16_384;
export const maximumEnvelopeBytes = 64_000;
export const intentLifetimeSeconds = 300;

const decimalPattern = /^(?:0|[1-9]\d*)$/u;
const shaPattern = /^[0-9a-f]{40}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const tagPattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const keyIdPattern = /^[A-Za-z0-9._-]{1,64}$/u;

export type DeploymentEnvironment = "staging" | "production";

export type IntentInput = Readonly<{
  repository: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryOwnerId: string;
  environment: DeploymentEnvironment;
  releaseTag: string;
  gitSha: string;
  manifestSha256: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  workflowRef: string;
  workflowSha: string;
  jobWorkflowRef: string;
  jobWorkflowSha: string;
  eventName: "push" | "workflow_dispatch";
  ref: string;
  issuedAtUnix: number;
  expiresAtUnix: number;
  nonce: string;
  capability: Readonly<{
    type: "github-actions-token";
    keyId: string;
    algorithm: "rsa-oaep-sha256";
    ciphertext: string;
  }>;
}>;

function fail(message: string): never {
  throw new Error(message);
}

function requireMatch(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) fail(`${label} is malformed.`);
  return value;
}

export function base64url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function createIntentBody(input: IntentInput): Buffer {
  requireMatch(input.repositoryId, decimalPattern, "repositoryId");
  requireMatch(input.repositoryOwnerId, decimalPattern, "repositoryOwnerId");
  requireMatch(input.workflowRunId, decimalPattern, "workflowRunId");
  requireMatch(input.releaseTag, tagPattern, "releaseTag");
  requireMatch(input.gitSha, shaPattern, "gitSha");
  requireMatch(input.manifestSha256, digestPattern, "manifestSha256");
  requireMatch(input.workflowSha, shaPattern, "workflowSha");
  requireMatch(input.jobWorkflowSha, shaPattern, "jobWorkflowSha");
  requireMatch(input.capability.keyId, keyIdPattern, "capability.keyId");
  if (!Number.isSafeInteger(input.workflowRunAttempt) || input.workflowRunAttempt < 1) fail("workflowRunAttempt is malformed.");
  if (!Number.isSafeInteger(input.issuedAtUnix) || !Number.isSafeInteger(input.expiresAtUnix)) fail("Intent timestamps are malformed.");
  if (input.expiresAtUnix <= input.issuedAtUnix || input.expiresAtUnix - input.issuedAtUnix > intentLifetimeSeconds) {
    fail("Intent lifetime is malformed.");
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(input.nonce)) fail("nonce is malformed.");
  if (!/^[A-Za-z0-9_-]+$/u.test(input.capability.ciphertext)) fail("capability.ciphertext is malformed.");
  const body = Buffer.from(JSON.stringify({
    protocolVersion: deploymentProtocolVersion,
    operation: deploymentOperation,
    repository: input.repository,
    repositoryId: input.repositoryId,
    repositoryOwner: input.repositoryOwner,
    repositoryOwnerId: input.repositoryOwnerId,
    environment: input.environment,
    releaseTag: input.releaseTag,
    gitSha: input.gitSha,
    manifestSha256: input.manifestSha256,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
    workflowRef: input.workflowRef,
    workflowSha: input.workflowSha,
    jobWorkflowRef: input.jobWorkflowRef,
    jobWorkflowSha: input.jobWorkflowSha,
    eventName: input.eventName,
    ref: input.ref,
    issuedAtUnix: input.issuedAtUnix,
    expiresAtUnix: input.expiresAtUnix,
    nonce: input.nonce,
    capability: {
      type: input.capability.type,
      keyId: input.capability.keyId,
      algorithm: input.capability.algorithm,
      ciphertext: input.capability.ciphertext,
    },
  } satisfies Record<string, unknown>), "utf8");
  if (body.length > maximumIntentBytes || body.at(-1) === 0x0a) fail("Intent body is too large or non-canonical.");
  return body;
}

export function intentDigest(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function createEnvelope(body: Uint8Array, oidcJwt: string): Readonly<{intentBody: string; oidcJwt: string}> {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(oidcJwt)) fail("OIDC token is malformed.");
  const envelope = Object.freeze({intentBody: base64url(body), oidcJwt});
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > maximumEnvelopeBytes) fail("Deployment envelope is too large.");
  return envelope;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) fail(`${name} is required.`);
  return value;
}

function apiHeaders(token: string, accept = "application/vnd.github+json"): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "yolpol-release-deployment/1",
  };
}

async function githubJson(path: string, token: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {...apiHeaders(token), ...(init.headers ?? {})},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail(`GitHub API request failed with status ${response.status}.`);
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("GitHub API response is malformed.");
  return value as Record<string, unknown>;
}

async function resolveTag(repository: string, token: string, tag: string): Promise<string> {
  let value = await githubJson(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`, token);
  for (let depth = 0; depth < 3; depth += 1) {
    const object = value.object;
    if (typeof object !== "object" || object === null || Array.isArray(object)) fail("Tag object is malformed.");
    const type = (object as Record<string, unknown>).type;
    const sha = (object as Record<string, unknown>).sha;
    if ((type !== "tag" && type !== "commit") || typeof sha !== "string" || !shaPattern.test(sha)) fail("Tag target is malformed.");
    if (type === "commit") return sha;
    value = await githubJson(`/repos/${repository}/git/tags/${sha}`, token);
  }
  return fail("Tag indirection is too deep.");
}

export type AuthenticatedRelease = Readonly<{gitSha: string; manifestSha256: string}>;

export async function authenticateRelease(repository: string, token: string, tag: string): Promise<AuthenticatedRelease> {
  requireMatch(tag, tagPattern, "release tag");
  const release = await githubJson(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, token);
  if (release.tag_name !== tag || release.draft !== false || release.prerelease !== false) fail("GitHub Release state is rejected.");
  const assets = release.assets;
  if (!Array.isArray(assets) || assets.length !== 2) fail("GitHub Release assets are rejected.");
  const expected = new Set(["release-manifest.json", "release-manifest.sha256"]);
  const byName = new Map<string, Record<string, unknown>>();
  for (const value of assets) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail("Release asset is malformed.");
    const asset = value as Record<string, unknown>;
    if (typeof asset.name !== "string" || !expected.has(asset.name) || byName.has(asset.name)) fail("Release asset identity is rejected.");
    if (typeof asset.id !== "number" || !Number.isSafeInteger(asset.id) || asset.id <= 0) fail("Release asset ID is rejected.");
    if (typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 1_000_000) {
      fail("Release asset size is rejected.");
    }
    byName.set(asset.name, asset);
  }
  const download = async (name: string): Promise<Buffer> => {
    const id = byName.get(name)?.id;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/assets/${String(id)}`, {
      headers: apiHeaders(token, "application/octet-stream"), signal: AbortSignal.timeout(15_000), redirect: "follow",
    });
    if (!response.ok) fail(`Release asset ${name} download failed.`);
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length === 0 || content.length > 1_000_000) fail(`Release asset ${name} size is rejected.`);
    return content;
  };
  const [manifestBytes, checksumBytes] = await Promise.all([
    download("release-manifest.json"), download("release-manifest.sha256"),
  ]);
  const checksumMatch = checksumBytes.toString("ascii").match(/^([0-9a-f]{64})  release-manifest\.json\n?$/u);
  if (checksumMatch === null || checksumMatch[1] !== manifestSha256(manifestBytes)) fail("Release manifest checksum is rejected.");
  const manifest = parseReleaseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown);
  const gitSha = await resolveTag(repository, token, tag);
  if (manifest.tag !== tag || manifest.gitSha !== gitSha || manifest.repository !== `https://github.com/${repository}`) {
    fail("Release manifest identity is rejected.");
  }
  return Object.freeze({gitSha, manifestSha256: manifestSha256(manifestBytes)});
}

function encryptCapability(token: string, publicKeyB64: string): string {
  const key = Buffer.from(publicKeyB64, "base64").toString("ascii");
  if (!key.includes("BEGIN PUBLIC KEY") || token.length === 0 || Buffer.byteLength(token, "utf8") > 512) {
    fail("Deployment capability encryption input is rejected.");
  }
  return base64url(publicEncrypt({key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256"}, Buffer.from(token, "utf8")));
}

async function oidcToken(audience: string): Promise<string> {
  const url = new URL(requiredEnvironment("ACTIONS_ID_TOKEN_REQUEST_URL"));
  url.searchParams.set("audience", audience);
  const response = await fetch(url, {
    headers: {Authorization: `Bearer ${requiredEnvironment("ACTIONS_ID_TOKEN_REQUEST_TOKEN")}`},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail("GitHub OIDC token request failed.");
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value) || typeof (value as Record<string, unknown>).value !== "string") {
    fail("GitHub OIDC response is malformed.");
  }
  return (value as {value: string}).value;
}

async function createDeployment(
  repository: string, token: string, environment: DeploymentEnvironment, gitSha: string,
  envelope: Readonly<{intentBody: string; oidcJwt: string}>,
): Promise<number> {
  const deployment = await githubJson(`/repos/${repository}/deployments`, token, {
    method: "POST",
    body: JSON.stringify({
      ref: gitSha,
      task: deploymentTask,
      auto_merge: false,
      required_contexts: [],
      payload: envelope,
      environment,
      description: deploymentDescription,
      transient_environment: false,
      production_environment: environment === "production",
    }),
    headers: {"Content-Type": "application/json"},
  });
  if (typeof deployment.id !== "number" || !Number.isSafeInteger(deployment.id) || deployment.id <= 0) fail("Created Deployment ID is malformed.");
  return deployment.id;
}

async function waitForDeployment(repository: string, token: string, deploymentId: number): Promise<void> {
  const deadline = Date.now() + 80 * 60 * 1_000;
  while (Date.now() < deadline) {
    const response = await fetch(`https://api.github.com/repos/${repository}/deployments/${deploymentId}/statuses?per_page=1`, {
      headers: apiHeaders(token), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) fail(`Deployment status request failed with status ${response.status}.`);
    const values: unknown = await response.json();
    if (!Array.isArray(values)) fail("Deployment statuses are malformed.");
    const latest = values[0];
    if (typeof latest === "object" && latest !== null && !Array.isArray(latest)) {
      const state = (latest as Record<string, unknown>).state;
      if (state === "success") return;
      if (state === "failure" || state === "error" || state === "inactive") fail(`Host deployment ended with ${state}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  fail("Host deployment did not complete before the strict timeout.");
}

function output(name: string, value: string): void {
  const target = requiredEnvironment("GITHUB_OUTPUT");
  appendFileSync(target, `${name}=${value}\n`, {encoding: "utf8"});
}

async function verifyCommand(): Promise<void> {
  const release = await authenticateRelease(
    requiredEnvironment("GITHUB_REPOSITORY"), requiredEnvironment("GITHUB_TOKEN"), requiredEnvironment("YOLPOL_RELEASE_TAG"),
  );
  output("git_sha", release.gitSha);
  output("manifest_sha256", release.manifestSha256);
}

async function requestCommand(): Promise<void> {
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  const token = requiredEnvironment("GITHUB_TOKEN");
  const environment = requiredEnvironment("YOLPOL_DEPLOYMENT_ENVIRONMENT");
  if (environment !== "staging" && environment !== "production") fail("Deployment environment is rejected.");
  const releaseTag = requiredEnvironment("YOLPOL_RELEASE_TAG");
  const release = await authenticateRelease(repository, token, releaseTag);
  const expectedSha = requiredEnvironment("YOLPOL_EXPECTED_GIT_SHA");
  const expectedManifest = requiredEnvironment("YOLPOL_EXPECTED_MANIFEST_SHA256");
  if (release.gitSha !== expectedSha || release.manifestSha256 !== expectedManifest) fail("Published Release does not match workflow inputs.");
  const capability = encryptCapability(token, requiredEnvironment("YOLPOL_DEPLOYMENT_CAPABILITY_PUBLIC_KEY_B64"));
  const issuedAtUnix = Math.floor(Date.now() / 1_000);
  const body = createIntentBody({
    repository,
    repositoryId: requiredEnvironment("GITHUB_REPOSITORY_ID"),
    repositoryOwner: requiredEnvironment("GITHUB_REPOSITORY_OWNER"),
    repositoryOwnerId: requiredEnvironment("GITHUB_REPOSITORY_OWNER_ID"),
    environment,
    releaseTag,
    gitSha: release.gitSha,
    manifestSha256: release.manifestSha256,
    workflowRunId: requiredEnvironment("GITHUB_RUN_ID"),
    workflowRunAttempt: Number.parseInt(requiredEnvironment("GITHUB_RUN_ATTEMPT"), 10),
    workflowRef: requiredEnvironment("YOLPOL_WORKFLOW_REF"),
    workflowSha: requiredEnvironment("YOLPOL_WORKFLOW_SHA"),
    jobWorkflowRef: requiredEnvironment("YOLPOL_JOB_WORKFLOW_REF"),
    jobWorkflowSha: requiredEnvironment("YOLPOL_JOB_WORKFLOW_SHA"),
    eventName: requiredEnvironment("GITHUB_EVENT_NAME") as "push" | "workflow_dispatch",
    ref: requiredEnvironment("GITHUB_REF"),
    issuedAtUnix,
    expiresAtUnix: issuedAtUnix + intentLifetimeSeconds,
    nonce: base64url(randomBytes(32)),
    capability: {
      type: "github-actions-token",
      keyId: requiredEnvironment("YOLPOL_DEPLOYMENT_CAPABILITY_KEY_ID"),
      algorithm: "rsa-oaep-sha256",
      ciphertext: capability,
    },
  });
  const audience = `${deploymentAudiencePrefix}${intentDigest(body)}`;
  const envelope = createEnvelope(body, await oidcToken(audience));
  const deploymentId = await createDeployment(repository, token, environment, release.gitSha, envelope);
  output("deployment_id", String(deploymentId));
  await waitForDeployment(repository, token, deploymentId);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (process.argv.length !== 3 || (command !== "verify" && command !== "request")) fail("Deployment command is rejected.");
  if (command === "verify") await verifyCommand();
  else await requestCommand();
}

if (process.argv[1]?.endsWith("release-deployment.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(`release-deployment: ${error instanceof Error ? error.message : "operation failed"}\n`);
    process.exitCode = 1;
  });
}
