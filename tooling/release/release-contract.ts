import {createHash} from "node:crypto";
import {readFileSync, readdirSync} from "node:fs";
import {basename, resolve} from "node:path";

export const releaseManifestVersion = 1 as const;
export const releasePlatform = "linux/amd64" as const;
export const releaseImageRoles = ["web", "worker", "migration", "backup-restore", "operations-metrics"] as const;

export type ReleaseImageRole = (typeof releaseImageRoles)[number];

export const releaseDockerTargets: Readonly<Record<ReleaseImageRole, string>> = Object.freeze({
  web: "runtime",
  worker: "worker-runtime",
  migration: "migration-runtime",
  "backup-restore": "operations-runtime",
  "operations-metrics": "monitoring-runtime",
});

export const releaseImagePackages: Readonly<Record<ReleaseImageRole, string>> = Object.freeze({
  web: "yolpol-web",
  worker: "yolpol-worker",
  migration: "yolpol-migration",
  "backup-restore": "yolpol-backup-restore",
  "operations-metrics": "yolpol-operations-metrics",
});

export type ReleaseImage = Readonly<{
  role: ReleaseImageRole;
  dockerTarget: string;
  repository: string;
  shaTag: string;
  semverTag: string;
  digest: string;
  immutableRef: string;
}>;

export type ReleaseManifest = Readonly<{
  manifestVersion: 1;
  version: string;
  tag: string;
  gitSha: string;
  repository: string;
  platform: "linux/amd64";
  database: Readonly<{
    latestMigration: string;
    migrationSetSha256: string;
  }>;
  images: readonly ReleaseImage[];
}>;

export type MigrationFingerprint = Readonly<{
  latestMigration: string;
  migrationSetSha256: string;
}>;

export type RollbackPlan = Readonly<{
  decision: "APPLICATION_ONLY_ROLLBACK_PERMITTED" | "MANUAL_DATABASE_REVIEW_REQUIRED";
  currentVersion: string;
  targetVersion: string;
  currentGitSha: string;
  targetGitSha: string;
  migrationFingerprintMatches: boolean;
  targetImages: readonly Readonly<{role: ReleaseImageRole; immutableRef: string}>[];
  requiredOperatorChecks: readonly string[];
}>;

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const gitShaPattern = /^[0-9a-f]{40}$/u;
const imageDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const migrationDigestPattern = /^[0-9a-f]{64}$/u;
const migrationNamePattern = /^\d{4}_[a-z0-9_]+$/u;
const ghcrRepositoryPattern = /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(`${field} must be an object.`);
}

function requireString(value: unknown, field: string): string {
  return typeof value === "string" ? value : fail(`${field} must be a string.`);
}

function requireExactKeys(record: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const unexpected = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${field} contains unexpected field(s): ${unexpected.sort().join(", ")}.`);
  const missing = allowed.filter((key) => !(key in record));
  if (missing.length > 0) fail(`${field} is missing field(s): ${missing.join(", ")}.`);
}

function rejectLatest(value: unknown): void {
  if (typeof value === "string" && /:latest(?:$|@)/iu.test(value)) fail("Release manifests must not contain latest image references.");
  if (Array.isArray(value)) value.forEach(rejectLatest);
  else if (isRecord(value)) Object.values(value).forEach(rejectLatest);
}

export function isReleaseVersion(value: string): boolean {
  return semverPattern.test(value);
}

export function validateReleaseTag(tag: string, packageVersion: string): void {
  if (!tag.startsWith("v") || !isReleaseVersion(tag.slice(1))) fail(`Release tag ${tag} is not strict vMAJOR.MINOR.PATCH SemVer.`);
  if (!isReleaseVersion(packageVersion)) fail(`Package version ${packageVersion} is not strict MAJOR.MINOR.PATCH SemVer.`);
  if (tag !== `v${packageVersion}`) fail(`Release tag ${tag} does not match package version ${packageVersion}.`);
}

export function validateGitSha(gitSha: string): void {
  if (!gitShaPattern.test(gitSha)) fail("gitSha must be a lowercase full 40-character hexadecimal Git SHA.");
}

export function validateImageDigest(digest: string): void {
  if (!imageDigestPattern.test(digest)) fail("Image digest must be sha256 followed by 64 lowercase hexadecimal characters.");
}

function validateSourceRepository(repository: string): string {
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    fail("repository must be an absolute GitHub HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    fail("repository must be a credential-free GitHub HTTPS URL.");
  }
  const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+$/u);
  if (match === null) fail("repository must identify one GitHub owner/repository pair without a trailing path.");
  return match[1].toLowerCase();
}

function validateImageRepository(repository: string): void {
  if (!ghcrRepositoryPattern.test(repository)) fail(`Image repository ${repository} must be a lowercase ghcr.io owner/package path without a tag.`);
}

function parseImageRole(value: unknown, field: string): ReleaseImageRole {
  const role = requireString(value, field);
  return releaseImageRoles.includes(role as ReleaseImageRole) ? role as ReleaseImageRole : fail(`${field} is not a supported first-party image role.`);
}

function parseReleaseImage(value: unknown, manifest: Readonly<{tag: string; gitSha: string; registryOwner: string}>, index: number): ReleaseImage {
  const field = `images[${index}]`;
  const image = requireRecord(value, field);
  requireExactKeys(image, ["role", "dockerTarget", "repository", "shaTag", "semverTag", "digest", "immutableRef"], field);
  const role = parseImageRole(image.role, `${field}.role`);
  const dockerTarget = requireString(image.dockerTarget, `${field}.dockerTarget`);
  const repository = requireString(image.repository, `${field}.repository`);
  const shaTag = requireString(image.shaTag, `${field}.shaTag`);
  const semverTag = requireString(image.semverTag, `${field}.semverTag`);
  const digest = requireString(image.digest, `${field}.digest`);
  const immutableRef = requireString(image.immutableRef, `${field}.immutableRef`);
  validateImageRepository(repository);
  validateImageDigest(digest);
  if (repository !== `ghcr.io/${manifest.registryOwner}/${releaseImagePackages[role]}`) fail(`${field}.repository does not match the source owner and role ${role}.`);
  if (dockerTarget !== releaseDockerTargets[role]) fail(`${field}.dockerTarget does not match role ${role}.`);
  if (shaTag !== `sha-${manifest.gitSha}`) fail(`${field}.shaTag does not match the release Git SHA.`);
  if (semverTag !== manifest.tag) fail(`${field}.semverTag does not match the release tag.`);
  if (immutableRef !== `${repository}@${digest}`) fail(`${field}.immutableRef must exactly match its repository and digest.`);
  return Object.freeze({role, dockerTarget, repository, shaTag, semverTag, digest, immutableRef});
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  rejectLatest(value);
  const manifest = requireRecord(value, "manifest");
  requireExactKeys(manifest, ["manifestVersion", "version", "tag", "gitSha", "repository", "platform", "database", "images"], "manifest");
  if (manifest.manifestVersion !== releaseManifestVersion) fail(`Unsupported manifestVersion ${String(manifest.manifestVersion)}.`);
  const version = requireString(manifest.version, "version");
  const tag = requireString(manifest.tag, "tag");
  const gitSha = requireString(manifest.gitSha, "gitSha");
  const repository = requireString(manifest.repository, "repository");
  const platform = requireString(manifest.platform, "platform");
  validateReleaseTag(tag, version);
  validateGitSha(gitSha);
  const registryOwner = validateSourceRepository(repository);
  if (platform !== releasePlatform) fail(`platform must be ${releasePlatform}.`);

  const database = requireRecord(manifest.database, "database");
  requireExactKeys(database, ["latestMigration", "migrationSetSha256"], "database");
  const latestMigration = requireString(database.latestMigration, "database.latestMigration");
  const migrationSetSha256 = requireString(database.migrationSetSha256, "database.migrationSetSha256");
  if (!migrationNamePattern.test(latestMigration)) fail("database.latestMigration is malformed.");
  if (!migrationDigestPattern.test(migrationSetSha256)) fail("database.migrationSetSha256 must be 64 lowercase hexadecimal characters.");

  if (!Array.isArray(manifest.images)) fail("images must be an array.");
  const images = manifest.images.map((image, index) => parseReleaseImage(image, {tag, gitSha, registryOwner}, index));
  const roles = images.map((image) => image.role);
  const duplicates = roles.filter((role, index) => roles.indexOf(role) !== index);
  if (duplicates.length > 0) fail(`Duplicate image role(s): ${[...new Set(duplicates)].join(", ")}.`);
  const missing = releaseImageRoles.filter((role) => !roles.includes(role));
  if (missing.length > 0) fail(`Missing required image role(s): ${missing.join(", ")}.`);
  if (images.length !== releaseImageRoles.length) fail("Manifest contains an unexpected number of first-party images.");

  return Object.freeze({
    manifestVersion: releaseManifestVersion,
    version,
    tag,
    gitSha,
    repository,
    platform: releasePlatform,
    database: Object.freeze({latestMigration, migrationSetSha256}),
    images: Object.freeze(images),
  });
}

type DrizzleJournal = Readonly<{entries?: readonly Readonly<{idx?: unknown; tag?: unknown}>[]}>;

function normalizedText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/gu, "\n");
}

export function calculateMigrationFingerprint(drizzleDirectory = resolve("drizzle")): MigrationFingerprint {
  const journalPath = resolve(drizzleDirectory, "meta/_journal.json");
  const journalText = normalizedText(journalPath);
  const journal = JSON.parse(journalText) as DrizzleJournal;
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) fail("Drizzle journal must contain at least one migration entry.");
  const tags = journal.entries.map((entry, index) => {
    if (entry.idx !== index || typeof entry.tag !== "string" || !migrationNamePattern.test(entry.tag)) {
      fail(`Drizzle journal entry ${index} is malformed or out of order.`);
    }
    return entry.tag;
  });
  if (new Set(tags).size !== tags.length) fail("Drizzle journal contains duplicate migration tags.");

  const sqlFiles = readdirSync(drizzleDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const expectedFiles = tags.map((tag) => `${tag}.sql`);
  if (sqlFiles.length !== expectedFiles.length || sqlFiles.some((file, index) => file !== expectedFiles[index])) {
    fail("Drizzle journal and root SQL migration files do not match exactly.");
  }

  const hash = createHash("sha256");
  const inputs = [
    {path: "drizzle/meta/_journal.json", content: journalText},
    ...sqlFiles.map((file) => ({path: `drizzle/${file}`, content: normalizedText(resolve(drizzleDirectory, file))})),
  ];
  for (const input of inputs) {
    hash.update(`${Buffer.byteLength(input.path, "utf8")}:${input.path}:${Buffer.byteLength(input.content, "utf8")}:`, "utf8");
    hash.update(input.content, "utf8");
  }
  return Object.freeze({latestMigration: tags.at(-1)!, migrationSetSha256: hash.digest("hex")});
}

export type PublishedImageInput = Readonly<{role: ReleaseImageRole; repository: string; digest: string}>;

export function parsePublishedImageInput(value: unknown): PublishedImageInput {
  const image = requireRecord(value, "published image");
  requireExactKeys(image, ["role", "repository", "digest"], "published image");
  const role = parseImageRole(image.role, "published image.role");
  const repository = requireString(image.repository, "published image.repository");
  const digest = requireString(image.digest, "published image.digest");
  validateImageRepository(repository);
  validateImageDigest(digest);
  if (!repository.endsWith(`/${releaseImagePackages[role]}`)) fail(`Published image repository does not match role ${role}.`);
  return Object.freeze({role, repository, digest});
}

export function generateReleaseManifest(input: Readonly<{
  version: string;
  tag: string;
  gitSha: string;
  repository: string;
  database: MigrationFingerprint;
  images: readonly PublishedImageInput[];
}>): ReleaseManifest {
  const manifest = {
    manifestVersion: releaseManifestVersion,
    version: input.version,
    tag: input.tag,
    gitSha: input.gitSha,
    repository: input.repository,
    platform: releasePlatform,
    database: input.database,
    images: input.images.map((image) => ({
      role: image.role,
      dockerTarget: releaseDockerTargets[image.role],
      repository: image.repository,
      shaTag: `sha-${input.gitSha}`,
      semverTag: input.tag,
      digest: image.digest,
      immutableRef: `${image.repository}@${image.digest}`,
    })),
  };
  return parseReleaseManifest(manifest);
}

export function manifestSha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function formatManifestChecksum(manifestPath: string, content: string | Buffer): string {
  return `${manifestSha256(content)}  ${basename(manifestPath)}\n`;
}

export function verifyManifestChecksum(manifestPath: string, checksumText: string): void {
  const match = checksumText.match(/^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/u);
  if (match === null) fail("Manifest checksum file is malformed.");
  if (match[2] !== basename(manifestPath)) fail("Manifest checksum filename does not match the manifest.");
  const actual = manifestSha256(readFileSync(manifestPath));
  if (actual !== match[1]) fail("Manifest checksum verification failed.");
}

function semverParts(version: string): readonly bigint[] {
  if (!isReleaseVersion(version)) fail(`Invalid release version ${version}.`);
  return version.split(".").map(BigInt);
}

function compareVersions(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

export function planRollback(currentValue: unknown, targetValue: unknown): RollbackPlan {
  const current = parseReleaseManifest(currentValue);
  const target = parseReleaseManifest(targetValue);
  if (compareVersions(target.version, current.version) >= 0) fail("Rollback target version must be older than the current version.");
  const migrationFingerprintMatches = current.database.latestMigration === target.database.latestMigration
    && current.database.migrationSetSha256 === target.database.migrationSetSha256;
  return Object.freeze({
    decision: migrationFingerprintMatches ? "APPLICATION_ONLY_ROLLBACK_PERMITTED" : "MANUAL_DATABASE_REVIEW_REQUIRED",
    currentVersion: current.version,
    targetVersion: target.version,
    currentGitSha: current.gitSha,
    targetGitSha: target.gitSha,
    migrationFingerprintMatches,
    targetImages: Object.freeze(target.images.map(({role, immutableRef}) => Object.freeze({role, immutableRef}))),
    requiredOperatorChecks: Object.freeze(migrationFingerprintMatches
      ? ["Redeploy only the target immutable application image references.", "Do not run migrations or restore a database.", "Verify liveness, readiness, workers, and monitoring."]
      : ["Stop automated rollback and review application/schema compatibility.", "Do not run down migrations or automatically restore the database.", "If recovery is required, validate a pre-migration encrypted backup in a separate database before controlled cutover."]),
  });
}
