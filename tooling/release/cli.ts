import {readFileSync, readdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  calculateMigrationFingerprint,
  formatManifestChecksum,
  generateReleaseManifest,
  parsePublishedImageInput,
  parseReleaseManifest,
  planRollback,
  validateReleaseTag,
  verifyManifestChecksum,
} from "./release-contract";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`Missing required option ${name}.`);
  return process.argv[index + 1];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
}

function packageVersion(packagePath = "package.json"): string {
  const metadata = readJson(packagePath);
  if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string") {
    throw new Error("package.json does not contain a string version.");
  }
  return metadata.version;
}

function loadPublishedImages(directory: string) {
  return readdirSync(resolve(directory))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => parsePublishedImageInput(readJson(resolve(directory, file))));
}

function main(): void {
  const command = process.argv[2];
  switch (command) {
    case "validate-tag": {
      const version = packageVersion(process.argv.includes("--package") ? option("--package") : "package.json");
      const tag = option("--tag");
      validateReleaseTag(tag, version);
      process.stdout.write(`${JSON.stringify({version, tag})}\n`);
      return;
    }
    case "migration-fingerprint": {
      const fingerprint = calculateMigrationFingerprint(process.argv.includes("--drizzle-dir") ? option("--drizzle-dir") : "drizzle");
      process.stdout.write(`${JSON.stringify(fingerprint, null, 2)}\n`);
      return;
    }
    case "write-image-record": {
      const image = parsePublishedImageInput({role: option("--role"), repository: option("--repository"), digest: option("--digest")});
      writeJson(option("--output"), image);
      return;
    }
    case "generate-manifest": {
      const tag = option("--tag");
      const version = packageVersion(process.argv.includes("--package") ? option("--package") : "package.json");
      validateReleaseTag(tag, version);
      const manifest = generateReleaseManifest({
        version,
        tag,
        gitSha: option("--git-sha"),
        repository: option("--repository"),
        database: calculateMigrationFingerprint(process.argv.includes("--drizzle-dir") ? option("--drizzle-dir") : "drizzle"),
        images: loadPublishedImages(option("--images-dir")),
      });
      writeJson(option("--output"), manifest);
      return;
    }
    case "validate-manifest": {
      parseReleaseManifest(readJson(option("--manifest")));
      process.stdout.write("release manifest valid\n");
      return;
    }
    case "checksum": {
      const manifestPath = resolve(option("--manifest"));
      const outputPath = resolve(option("--output"));
      parseReleaseManifest(readJson(manifestPath));
      writeFileSync(outputPath, formatManifestChecksum(manifestPath, readFileSync(manifestPath)), {encoding: "utf8", flag: "wx"});
      return;
    }
    case "verify-checksum": {
      const manifestPath = resolve(option("--manifest"));
      parseReleaseManifest(readJson(manifestPath));
      verifyManifestChecksum(manifestPath, readFileSync(resolve(option("--checksum")), "utf8"));
      process.stdout.write("release manifest checksum valid\n");
      return;
    }
    case "plan-rollback": {
      const plan = planRollback(readJson(option("--current")), readJson(option("--target")));
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return;
    }
    default:
      throw new Error("Unknown release command.");
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown release tooling error."}\n`);
  process.exitCode = 1;
}
