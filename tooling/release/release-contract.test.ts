import {mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {
  calculateMigrationFingerprint,
  formatManifestChecksum,
  generateReleaseManifest,
  parseReleaseManifest,
  planRollback,
  releaseImageRoles,
  validateReleaseTag,
  verifyManifestChecksum,
  type PublishedImageInput,
  type ReleaseManifest,
} from "./release-contract";

const temporaryDirectories: string[] = [];
const shaA = "a".repeat(40);
const shaB = "b".repeat(40);

function temporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "yolpol-release-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function publishedImages(): PublishedImageInput[] {
  return releaseImageRoles.map((role, index) => ({
    role,
    repository: `ghcr.io/example/yolpol-${role}`,
    digest: `sha256:${String(index + 1).repeat(64)}`,
  }));
}

function manifest(version = "0.2.0", gitSha = shaA, migrationSetSha256 = "c".repeat(64)): ReleaseManifest {
  return generateReleaseManifest({
    version,
    tag: `v${version}`,
    gitSha,
    repository: "https://github.com/example/yolpol",
    database: {latestMigration: "0022_global_translation_settings", migrationSetSha256},
    images: publishedImages(),
  });
}

function writeMigrationSet(directory: string, sql = "select 1;\n"): void {
  mkdirSync(resolve(directory, "meta"), {recursive: true});
  writeFileSync(resolve(directory, "meta/_journal.json"), `${JSON.stringify({entries: [{idx: 0, tag: "0000_initial"}]}, null, 2)}\n`);
  writeFileSync(resolve(directory, "0000_initial.sql"), sql);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true});
});

describe("release version contract", () => {
  it("accepts strict SemVer tags that match package versions", () => {
    expect(() => validateReleaseTag("v0.1.0", "0.1.0")).not.toThrow();
    expect(() => validateReleaseTag("v12.34.56", "12.34.56")).not.toThrow();
  });

  it.each(["v01.0.0", "v1.0", "1.0.0", "v1.0.0-rc.1", "v1.0.0+build"])("rejects invalid release tag %s", (tag) => {
    expect(() => validateReleaseTag(tag, "1.0.0")).toThrow(/SemVer/u);
  });

  it("rejects a tag and package version mismatch", () => {
    expect(() => validateReleaseTag("v0.1.1", "0.1.0")).toThrow(/does not match/u);
  });
});

describe("migration fingerprint", () => {
  it("is deterministic for the same normalized committed migration set", () => {
    const first = temporaryDirectory();
    const second = temporaryDirectory();
    writeMigrationSet(first, "select 1;\r\n");
    writeMigrationSet(second, "select 1;\n");
    expect(calculateMigrationFingerprint(first)).toEqual(calculateMigrationFingerprint(second));
  });

  it("changes when migration content changes", () => {
    const directory = temporaryDirectory();
    writeMigrationSet(directory);
    const before = calculateMigrationFingerprint(directory);
    writeFileSync(resolve(directory, "0000_initial.sql"), "select 2;\n");
    expect(calculateMigrationFingerprint(directory).migrationSetSha256).not.toBe(before.migrationSetSha256);
  });

  it("requires the journal and SQL migration set to match exactly", () => {
    const directory = temporaryDirectory();
    writeMigrationSet(directory);
    writeFileSync(resolve(directory, "0001_unjournaled.sql"), "select 2;\n");
    expect(() => calculateMigrationFingerprint(directory)).toThrow(/do not match exactly/u);
  });
});

describe("release manifest", () => {
  it("validates all required first-party image roles and immutable references", () => {
    expect(parseReleaseManifest(manifest())).toEqual(manifest());
  });

  it("rejects an unsupported manifest version", () => {
    expect(() => parseReleaseManifest({...manifest(), manifestVersion: 2})).toThrow(/Unsupported manifestVersion/u);
  });

  it("rejects malformed full Git SHAs", () => {
    expect(() => generateReleaseManifest({
      version: "0.2.0", tag: "v0.2.0", gitSha: "abcdef0", repository: "https://github.com/example/yolpol",
      database: {latestMigration: "0022_global_translation_settings", migrationSetSha256: "c".repeat(64)}, images: publishedImages(),
    })).toThrow(/40-character/u);
  });

  it("rejects malformed image digests", () => {
    const images = publishedImages();
    images[0] = {...images[0], digest: "sha256:not-a-digest"};
    expect(() => generateReleaseManifest({
      version: "0.2.0", tag: "v0.2.0", gitSha: shaA, repository: "https://github.com/example/yolpol",
      database: {latestMigration: "0022_global_translation_settings", migrationSetSha256: "c".repeat(64)}, images,
    })).toThrow(/Image digest/u);
  });

  it("rejects latest references", () => {
    const value = structuredClone(manifest()) as unknown as {images: Array<{immutableRef: string}>};
    value.images[0].immutableRef = "ghcr.io/example/yolpol-web:latest";
    expect(() => parseReleaseManifest(value)).toThrow(/latest/u);
  });

  it("rejects a missing required image role", () => {
    const value = structuredClone(manifest()) as unknown as {images: Array<Record<string, unknown>>};
    value.images.pop();
    expect(() => parseReleaseManifest(value)).toThrow(/Missing required image role/u);
  });

  it("rejects duplicate image roles", () => {
    const value = structuredClone(manifest()) as unknown as {images: Array<Record<string, unknown>>};
    value.images[4] = {...value.images[0]};
    expect(() => parseReleaseManifest(value)).toThrow(/Duplicate image role/u);
  });

  it("requires immutable references to use the exact repository digest", () => {
    const value = structuredClone(manifest()) as unknown as {images: Array<{repository: string; immutableRef: string}>};
    value.images[0].immutableRef = `${value.images[0].repository}:v0.2.0`;
    expect(() => parseReleaseManifest(value)).toThrow(/repository and digest/u);
  });

  it("requires image repositories to match the lowercase source owner and role", () => {
    const value = structuredClone(manifest()) as unknown as {images: Array<{repository: string; digest: string; immutableRef: string}>};
    value.images[0].repository = "ghcr.io/another-owner/yolpol-web";
    value.images[0].immutableRef = `ghcr.io/another-owner/yolpol-web@${value.images[0].digest}`;
    expect(() => parseReleaseManifest(value)).toThrow(/source owner and role/u);
  });

  it("rejects unexpected fields so secret material cannot enter the contract", () => {
    expect(() => parseReleaseManifest({...manifest(), databaseUrl: "postgresql://secret"})).toThrow(/unexpected field/u);
    expect(JSON.stringify(manifest())).not.toMatch(/password|token|secret|databaseUrl/iu);
  });

  it("writes and verifies a SHA-256 checksum and detects corruption", () => {
    const directory = temporaryDirectory();
    const manifestPath = resolve(directory, "release-manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest(), null, 2)}\n`);
    const checksum = formatManifestChecksum(manifestPath, readFileSync(manifestPath));
    expect(() => verifyManifestChecksum(manifestPath, checksum)).not.toThrow();
    writeFileSync(manifestPath, `${JSON.stringify(manifest("0.2.1"), null, 2)}\n`);
    expect(() => verifyManifestChecksum(manifestPath, checksum)).toThrow(/verification failed/u);
  });
});

describe("rollback planner", () => {
  it("permits only a conservative application rollback for the same migration fingerprint", () => {
    const plan = planRollback(manifest("0.2.0", shaA), manifest("0.1.0", shaB));
    expect(plan.decision).toBe("APPLICATION_ONLY_ROLLBACK_PERMITTED");
    expect(plan.migrationFingerprintMatches).toBe(true);
    expect(plan.targetImages).toHaveLength(5);
    expect(plan.targetImages.every((image) => image.immutableRef.includes("@sha256:"))).toBe(true);
  });

  it("requires manual database review when migration fingerprints differ", () => {
    const plan = planRollback(manifest("0.2.0", shaA, "c".repeat(64)), manifest("0.1.0", shaB, "d".repeat(64)));
    expect(plan.decision).toBe("MANUAL_DATABASE_REVIEW_REQUIRED");
    expect(plan.requiredOperatorChecks.join(" ")).toMatch(/Do not run down migrations/u);
  });

  it("requires manual database review when latest migration identifiers differ", () => {
    const current = manifest("0.2.0", shaA);
    const target = structuredClone(manifest("0.1.0", shaB)) as unknown as Record<string, unknown>;
    target.database = {...(target.database as Record<string, unknown>), latestMigration: "0021_previous"};
    const plan = planRollback(current, target);
    expect(plan.decision).toBe("MANUAL_DATABASE_REVIEW_REQUIRED");
  });

  it("is pure and does not mutate either manifest", () => {
    const current = manifest("0.2.0", shaA);
    const target = manifest("0.1.0", shaB);
    const currentBefore = JSON.stringify(current);
    const targetBefore = JSON.stringify(target);
    planRollback(current, target);
    expect(JSON.stringify(current)).toBe(currentBefore);
    expect(JSON.stringify(target)).toBe(targetBefore);
  });
});
