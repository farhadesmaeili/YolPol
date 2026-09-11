import {spawn} from "node:child_process";
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";

const postgresImage = "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const validationPassword = "synthetic-backup-restore-only";
const validationUser = "yolpol_restore_validation";
const validationDatabase = "yolpol_restore_validation";
const unique = `${process.pid}-${Date.now()}`;
const network = `yolpol-backup-restore-${unique}`;
const source = `yolpol-backup-source-${unique}`;
const destination = `yolpol-backup-destination-${unique}`;
const operationsImage = `yolpol-operations-validation:${unique}`;
const migrationImage = `yolpol-migration-validation:${unique}`;
const temporaryRoot = await mkdtemp(join(tmpdir(), "yolpol-backup-restore-"));
const backupDirectory = join(temporaryRoot, "backups");
const keyDirectory = join(temporaryRoot, "keys");
await mkdir(backupDirectory);
await mkdir(keyDirectory);
const transcript = [];
const startedContainers = [];
let networkCreated = false;

async function run(args, {expectFailure = false, label = args.join(" ")} = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {cwd: process.cwd(), windowsHide: true});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => { resolve({code, stdout, stderr}); });
  });
  transcript.push(result.stdout, result.stderr);
  const failed = result.code !== 0;
  if (failed !== expectFailure) {
    const details = `${result.stdout}\n${result.stderr}`.trim().slice(-4_000);
    throw new Error(`${label} ${expectFailure ? "unexpectedly succeeded" : "failed"}.${details ? `\n${details}` : ""}`);
  }
  process.stdout.write(`${label}: ${expectFailure ? "rejected as expected" : "passed"}\n`);
  return result.stdout.trim();
}

function bind(sourcePath, target, readOnly = false) {
  return `type=bind,source=${sourcePath},target=${target}${readOnly ? ",readonly" : ""}`;
}

function databaseUrl(host) {
  return `postgresql://${validationUser}:${validationPassword}@${host}:5432/${validationDatabase}`;
}

async function waitForDatabase(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("docker", ["exec", container, "pg_isready", "-U", validationUser, "-d", validationDatabase], {windowsHide: true});
      child.once("error", reject);
      child.once("close", (code) => resolve(code));
    });
    if (result === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Disposable PostgreSQL ${container} did not become ready.`);
}

async function runOperation(command, backupId, environment = {}) {
  const args = [
    "run", "--rm", "--network", network,
    "--mount", bind(backupDirectory, "/backups", command !== "create" && command !== "prune"),
    "-e", "YOLPOL_BACKUP_DIRECTORY=/backups",
  ];
  for (const [name, value] of Object.entries(environment)) args.push("-e", `${name}=${value}`);
  args.push(operationsImage, command);
  if (backupId) args.push(backupId);
  return run(args, {label: `operations ${command}`});
}

async function cleanup() {
  for (const container of startedContainers.reverse()) {
    await run(["stop", "--time", "10", container], {label: `cleanup ${container}`}).catch(() => {});
  }
  if (networkCreated) await run(["network", "rm", network], {label: "cleanup validation network"}).catch(() => {});
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  if (
    dirname(resolvedTemporaryRoot) === resolve(tmpdir())
    && basename(resolvedTemporaryRoot).startsWith("yolpol-backup-restore-")
  ) {
    await rm(resolvedTemporaryRoot, {recursive: true, force: true});
  }
}

try {
  await run(["build", "--target", "operations-runtime", "-t", operationsImage, "."], {label: "operations image build"});
  await run(["build", "--target", "migration-runtime", "-t", migrationImage, "."], {label: "migration image build"});
  await run(["network", "create", network], {label: "create isolated validation network"});
  networkCreated = true;

  for (const container of [source, destination]) {
    await run([
      "run", "--detach", "--rm", "--name", container, "--network", network,
      "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,size=512m",
      "-e", `POSTGRES_USER=${validationUser}`,
      "-e", `POSTGRES_PASSWORD=${validationPassword}`,
      "-e", `POSTGRES_DB=${validationDatabase}`,
      postgresImage,
    ], {label: `start ${container === source ? "source" : "destination"} tmpfs PostgreSQL`});
    startedContainers.push(container);
  }
  await Promise.all([waitForDatabase(source), waitForDatabase(destination)]);
  process.stdout.write("source and destination readiness: passed\n");

  await run([
    "run", "--rm", "--network", network,
    "-e", `DATABASE_URL=${databaseUrl(source)}`,
    migrationImage,
  ], {label: "apply migrations to source only"});
  await run([
    "exec", source, "psql", "-X", "-U", validationUser, "-d", validationDatabase,
    "-v", "ON_ERROR_STOP=1", "-c",
    "create table backup_restore_validation_marker (value text primary key); insert into backup_restore_validation_marker values ('synthetic-restore-marker');",
  ], {label: "insert synthetic source marker"});

  await run([
    "run", "--rm", "--network", network,
    "--entrypoint", "psql",
    operationsImage, "--dbname", databaseUrl(source), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "show server_version_num",
  ], {label: "operations database connection preflight"});

  await run(["run", "--rm", "--entrypoint", "age-keygen", "--mount", bind(keyDirectory, "/keys"), operationsImage, "-o", "/keys/identity"], {label: "generate disposable restore identity"});
  const recipient = await run(["run", "--rm", "--entrypoint", "age-keygen", "--mount", bind(keyDirectory, "/keys", true), operationsImage, "-y", "/keys/identity"], {label: "derive disposable public recipient"});

  await runOperation("create", undefined, {
    DATABASE_URL: databaseUrl(source),
    YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging",
    YOLPOL_GIT_REVISION: "abcdef0",
    YOLPOL_BACKUP_AGE_RECIPIENT: recipient,
  });
  const files = await readdir(backupDirectory);
  const manifests = files.filter((file) => file.endsWith(".manifest.json"));
  if (manifests.length !== 1) throw new Error("Validation expected exactly one manifest.");
  const backupId = manifests[0].slice(0, -".manifest.json".length);
  if (files.some((file) => file.includes("partial") || file.endsWith(".dump"))) throw new Error("A plaintext or partial backup persisted.");

  await runOperation("verify", backupId);
  await run([
    "run", "--rm", "--network", "none", "--entrypoint", "sh",
    "--mount", bind(backupDirectory, "/backups", true),
    "--mount", bind(keyDirectory, "/keys", true),
    operationsImage, "-c",
    "set -o pipefail; age --decrypt --identity /keys/identity \"/backups/$1.dump.age\" | pg_restore --list >/dev/null",
    "validation-archive", backupId,
  ], {label: "direct decrypt/archive pipeline preflight"});
  await run([
    "run", "--rm", "--network", "none",
    "--mount", bind(backupDirectory, "/backups", true),
    "--mount", bind(keyDirectory, "/keys", true),
    "-e", "YOLPOL_BACKUP_DIRECTORY=/backups",
    "-e", "YOLPOL_BACKUP_AGE_IDENTITY_FILE=/keys/identity",
    operationsImage, "deep-verify", backupId,
  ], {label: "deep archive verification"});

  await run([
    "run", "--rm", "--network", network,
    "--mount", bind(backupDirectory, "/backups", true),
    "--mount", bind(keyDirectory, "/keys", true),
    "-e", "YOLPOL_BACKUP_DIRECTORY=/backups",
    "-e", "YOLPOL_BACKUP_AGE_IDENTITY_FILE=/keys/identity",
    "-e", "YOLPOL_RESTORE_CONFIRMATION=RESTORE_TO_EMPTY_DATABASE",
    "-e", `DATABASE_URL=${databaseUrl(destination)}`,
    operationsImage, "restore", backupId,
  ], {label: "full restore into separate empty destination"});

  const marker = await run([
    "exec", destination, "psql", "-X", "-A", "-t", "-U", validationUser, "-d", validationDatabase,
    "-v", "ON_ERROR_STOP=1", "-c", "select value from backup_restore_validation_marker;",
  ], {label: "restored synthetic marker verification"});
  if (marker !== "synthetic-restore-marker") throw new Error("Synthetic restore marker did not match.");
  const migrationTimestamp = await run([
    "exec", destination, "psql", "-X", "-A", "-t", "-U", validationUser, "-d", validationDatabase,
    "-v", "ON_ERROR_STOP=1", "-c", "select max(created_at) from drizzle.__drizzle_migrations;",
  ], {label: "restored migration-state verification"});
  if (Number(migrationTimestamp) < 1788832991886) throw new Error("Restored migration state is below the required marker.");

  await run([
    "run", "--rm", "--network", network,
    "--mount", bind(backupDirectory, "/backups", true),
    "--mount", bind(keyDirectory, "/keys", true),
    "-e", "YOLPOL_BACKUP_DIRECTORY=/backups",
    "-e", "YOLPOL_BACKUP_AGE_IDENTITY_FILE=/keys/identity",
    "-e", "YOLPOL_RESTORE_CONFIRMATION=RESTORE_TO_EMPTY_DATABASE",
    "-e", `DATABASE_URL=${databaseUrl(destination)}`,
    operationsImage, "restore", backupId,
  ], {label: "non-empty restore safety", expectFailure: true});

  await run([
    "run", "--rm", "--network", "none",
    "--mount", bind(backupDirectory, "/backups", true),
    "-e", "YOLPOL_BACKUP_DIRECTORY=/backups",
    "-e", "YOLPOL_BACKUP_AGE_IDENTITY_FILE=/missing",
    operationsImage, "deep-verify", backupId,
  ], {label: "missing identity negative test", expectFailure: true});

  await run(["run", "--rm", "--entrypoint", "age-keygen", "--mount", bind(keyDirectory, "/keys"), operationsImage, "-o", "/keys/wrong-identity"], {label: "generate disposable wrong identity"});
  await run([
    "run", "--rm", "--network", "none",
    "--mount", bind(backupDirectory, "/backups", true),
    "--mount", bind(keyDirectory, "/keys", true),
    "-e", "YOLPOL_BACKUP_DIRECTORY=/backups",
    "-e", "YOLPOL_BACKUP_AGE_IDENTITY_FILE=/keys/wrong-identity",
    operationsImage, "deep-verify", backupId,
  ], {label: "wrong identity negative test", expectFailure: true});

  const artifactPath = join(backupDirectory, `${backupId}.dump.age`);
  const intactArtifactPath = join(temporaryRoot, "intact.dump.age");
  await copyFile(artifactPath, intactArtifactPath);
  const corrupted = await readFile(artifactPath);
  corrupted[corrupted.length - 1] ^= 0xff;
  await writeFile(artifactPath, corrupted);
  await runOperation("verify", backupId).then(
    () => { throw new Error("Checksum corruption was not rejected."); },
    () => { process.stdout.write("checksum corruption negative test: rejected as expected\n"); },
  );
  await copyFile(intactArtifactPath, artifactPath);
  await runOperation("verify", backupId);

  await runOperation("prune", undefined, {
    YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging",
    YOLPOL_BACKUP_RETENTION_COUNT: "1",
  });
  if (!(await readdir(backupDirectory)).includes(`${backupId}.dump.age`)) throw new Error("Retention dry-run removed the newest artifact.");

  const identity = await readFile(join(keyDirectory, "identity"), "utf8");
  const combinedTranscript = transcript.join("\n");
  if (combinedTranscript.includes(validationPassword) || combinedTranscript.includes(identity.trim()) || combinedTranscript.includes("AGE-SECRET-KEY-")) {
    throw new Error("Validation logs exposed synthetic secret material.");
  }

  const imageInspection = await run(["image", "inspect", "--format", "{{.Size}} {{.Config.User}} {{json .Config.Entrypoint}}", operationsImage], {label: "operations image metadata inspection"});
  const postgresClientVersion = await run(["run", "--rm", "--entrypoint", "pg_dump", operationsImage, "--version"], {label: "PostgreSQL client version inspection"});
  const ageVersion = await run(["run", "--rm", "--entrypoint", "age", operationsImage, "--version"], {label: "age version inspection"});
  const runtimeIdentity = await run(["run", "--rm", "--entrypoint", "id", operationsImage], {label: "non-root runtime inspection"});
  await run(["run", "--rm", "--entrypoint", "sh", operationsImage, "-c", "test ! -e /.env.local && test ! -e /.git && test ! -e /run/secrets/backup_age_identity"], {label: "image secret/source exclusion inspection"});

  process.stdout.write(`${JSON.stringify({
    result: "PASS",
    backupId,
    sourceContainer: source,
    destinationContainer: destination,
    distinctDatabases: source !== destination,
    persistentValidationVolumesCreated: 0,
    imageInspection,
    postgresClientVersion,
    ageVersion,
    runtimeIdentity,
  })}\n`);
} finally {
  await cleanup();
}
