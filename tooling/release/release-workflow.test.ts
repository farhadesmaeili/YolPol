import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/release.yml"), "utf8");
const stagingCompose = readFileSync(resolve(repositoryRoot, "deploy/staging/compose.yaml"), "utf8");
const monitoringCompose = readFileSync(resolve(repositoryRoot, "deploy/monitoring/compose.yaml"), "utf8");

describe("release publication workflow", () => {
  it("is tag-triggered, release-concurrent, and leaves CI check names separate", () => {
    expect(workflow).toContain('      - "v*.*.*"');
    expect(workflow).toContain("group: release-${{ github.ref_name }}");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("git merge-base --is-ancestor");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toMatch(/branches:\s/u);
  });

  it("uses only narrow built-in-token permissions and does not deploy", () => {
    expect(workflow).toContain("packages: write");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("password: ${{ secrets.GITHUB_TOKEN }}");
    expect(workflow).not.toMatch(/id-token: write|administration:|ssh|scp|deploy/u);
  });

  it("publishes every first-party runtime target and no test target", () => {
    for (const target of ["runtime", "worker-runtime", "migration-runtime", "operations-runtime", "monitoring-runtime"]) {
      expect(workflow).toContain(`target: ${target}`);
    }
    for (const packageName of ["yolpol-web", "yolpol-worker", "yolpol-migration", "yolpol-backup-restore", "yolpol-operations-metrics"]) {
      expect(workflow).toContain(`package: ${packageName}`);
    }
    expect(workflow).not.toContain("target: operations-test");
  });

  it("never uses an ambiguous release image reference", () => {
    expect(workflow).not.toContain(":latest");
    expect(stagingCompose).not.toContain(":latest");
    expect(monitoringCompose).not.toContain(":latest");
    expect(workflow).toContain("@${{ steps.digest.outputs.value }}");
  });
});
