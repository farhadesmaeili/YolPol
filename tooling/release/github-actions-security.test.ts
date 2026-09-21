import {readdirSync, readFileSync} from "node:fs";
import {extname, resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const workflowsDirectory = resolve(repositoryRoot, ".github/workflows");
const immutableGitHubActionPattern = /^[^/@\s]+\/[^@\s]+@[0-9a-f]{40}$/iu;
const usesPattern = /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^#\s]+))/u;

function isImmutableExternalGitHubAction(reference: string): boolean {
  return reference.startsWith("./") || immutableGitHubActionPattern.test(reference);
}

function collectWorkflowFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return collectWorkflowFiles(path);
    }

    return [".yml", ".yaml"].includes(extname(entry.name)) ? [path] : [];
  });
}

function collectUsesReferences(workflow: string): string[] {
  return workflow.split(/\r?\n/u).flatMap((line) => {
    const match = usesPattern.exec(line);
    const reference = match?.[1] ?? match?.[2] ?? match?.[3];

    return reference === undefined ? [] : [reference];
  });
}

describe("GitHub Actions supply-chain security", () => {
  it("recognizes immutable external Actions and repository-local workflows", () => {
    expect(isImmutableExternalGitHubAction("actions/checkout@0123456789abcdef0123456789abcdef01234567")).toBe(true);
    expect(isImmutableExternalGitHubAction("./.github/workflows/deploy-release.yml")).toBe(true);
    expect(isImmutableExternalGitHubAction("actions/checkout@v7")).toBe(false);
    expect(isImmutableExternalGitHubAction("docker/login-action@v4")).toBe(false);
  });

  it("pins every external Action in every workflow to a full commit SHA", () => {
    const mutableReferences = collectWorkflowFiles(workflowsDirectory).flatMap((path) =>
      collectUsesReferences(readFileSync(path, "utf8"))
        .filter((reference) => !isImmutableExternalGitHubAction(reference))
        .map((reference) => `${path}: ${reference}`),
    );

    expect(mutableReferences).toEqual([]);
  });
});
