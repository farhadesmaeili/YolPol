import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {
  calculateMigrationFingerprint,
  generateReleaseManifest,
  parseReleaseManifest,
  releaseImageRoles,
} from "./release-contract";

const acceptanceMigrationTag = "0024_phase_c2_live_acceptance";
const acceptanceMigrationTimestamp = 1791230751683;
const previousMigrationTag = "0023_telegram_notification_destinations";
const previousMigrationTimestamp = 1789391490099;
const previousMigrationSetSha256 = "48bfbae76d5421516cfca1406c47e509e0e9c89edac3cda048c08aa15e190f24";
const acceptanceMigrationSql = "SELECT 1;\n";
const drizzleDirectory = resolve("drizzle");
const temporaryDirectories: string[] = [];

type JournalEntry = Readonly<{
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}>;

type Journal = Readonly<{
  version: string;
  dialect: string;
  entries: readonly JournalEntry[];
}>;

function readJournal(): Journal {
  return JSON.parse(readFileSync(resolve(drizzleDirectory, "meta/_journal.json"), "utf8")) as Journal;
}

function snapshotSchema(snapshot: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "id" && key !== "prevId"),
  );
}

function createPreAcceptanceMigrationSet(journal: Journal): string {
  const directory = mkdtempSync(resolve(tmpdir(), "yolpol-pre-0024-migrations-"));
  temporaryDirectories.push(directory);
  mkdirSync(resolve(directory, "meta"));
  const historicalEntries = journal.entries.slice(0, -1);
  writeFileSync(
    resolve(directory, "meta/_journal.json"),
    JSON.stringify({...journal, entries: historicalEntries}, null, 2),
  );
  for (const entry of historicalEntries) {
    copyFileSync(resolve(drizzleDirectory, `${entry.tag}.sql`), resolve(directory, `${entry.tag}.sql`));
  }
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true});
});

describe("Phase C2 changed-fingerprint acceptance migration", () => {
  it("is the unique final journal entry after migration 0023", () => {
    const journal = readJournal();
    const previous = journal.entries.at(-2);
    const acceptance = journal.entries.at(-1);

    expect(previous).toMatchObject({
      idx: 23,
      when: previousMigrationTimestamp,
      tag: previousMigrationTag,
    });
    expect(acceptance).toEqual({
      idx: 24,
      version: "7",
      when: acceptanceMigrationTimestamp,
      tag: acceptanceMigrationTag,
      breakpoints: true,
    });
    expect(acceptanceMigrationTimestamp).toBeGreaterThan(previousMigrationTimestamp);
    expect(new Set(journal.entries.map(({idx}) => idx)).size).toBe(journal.entries.length);
    expect(journal.entries.map(({idx}) => idx)).toEqual(journal.entries.map((_, index) => index));
  });

  it("contains only the fixed PostgreSQL no-op and no schema snapshot change", () => {
    expect(readFileSync(resolve(drizzleDirectory, `${acceptanceMigrationTag}.sql`), "utf8"))
      .toBe(acceptanceMigrationSql);

    const previousSnapshot = JSON.parse(
      readFileSync(resolve(drizzleDirectory, "meta/0023_snapshot.json"), "utf8"),
    ) as Record<string, unknown>;
    const acceptanceSnapshot = JSON.parse(
      readFileSync(resolve(drizzleDirectory, "meta/0024_snapshot.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(acceptanceSnapshot.prevId).toBe(previousSnapshot.id);
    expect(snapshotSchema(acceptanceSnapshot)).toEqual(snapshotSchema(previousSnapshot));
  });

  it("preserves the historical migration set and changes the release fingerprint", () => {
    const journal = readJournal();
    const previousFingerprint = calculateMigrationFingerprint(createPreAcceptanceMigrationSet(journal));
    const acceptanceFingerprint = calculateMigrationFingerprint(drizzleDirectory);

    expect(previousFingerprint).toEqual({
      latestMigration: previousMigrationTag,
      migrationSetSha256: previousMigrationSetSha256,
    });
    expect(acceptanceFingerprint.latestMigration).toBe(acceptanceMigrationTag);
    expect(acceptanceFingerprint.migrationSetSha256).not.toBe(previousMigrationSetSha256);
  });

  it("produces a release-manifest database identity accepted by the release contract", () => {
    const fingerprint = calculateMigrationFingerprint(drizzleDirectory);
    const manifest = generateReleaseManifest({
      version: "0.2.6",
      tag: "v0.2.6",
      gitSha: "a".repeat(40),
      repository: "https://github.com/farhadesmaeili/YolPol",
      database: fingerprint,
      images: releaseImageRoles.map((role, index) => ({
        role,
        repository: `ghcr.io/farhadesmaeili/yolpol-${role}`,
        digest: `sha256:${String(index + 1).repeat(64)}`,
      })),
    });

    expect(parseReleaseManifest(manifest).database).toEqual(fingerprint);
  });
});
