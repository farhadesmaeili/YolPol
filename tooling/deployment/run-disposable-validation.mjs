import {execFileSync} from "node:child_process";
import {copyFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";

const image = `yolpol-deployment-validation:${process.pid}-${Date.now()}`;
const temporaryContext = mkdtempSync(join(tmpdir(), "yolpol-deployment-context-"));

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
}

try {
  for (const source of [
    "tooling/deployment/Dockerfile",
    "tooling/deployment/test-wrapper-linux.sh",
    "deploy/operations/yolpol-deploy",
    "deploy/operations/sudoers.yolpol-deploy",
  ]) {
    copyFileSync(resolve(source), join(temporaryContext, basename(source)));
  }
  docker(["build", "--file", join(temporaryContext, "Dockerfile"), "--tag", image, temporaryContext]);
  docker(["run", "--rm", "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev", image]);
} finally {
  try {
    docker(["image", "rm", "--force", image], {stdio: "ignore"});
  } catch {
    // Preserve the primary validation failure; this image has a unique test-only tag.
  }
  const resolvedTemporaryContext = resolve(temporaryContext);
  if (dirname(resolvedTemporaryContext) === resolve(tmpdir()) && basename(resolvedTemporaryContext).startsWith("yolpol-deployment-context-")) {
    rmSync(resolvedTemporaryContext, {recursive: true, force: true});
  }
}
