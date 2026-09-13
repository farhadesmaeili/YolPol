import "server-only";

import {readFileSync} from "node:fs";
import {readFile} from "node:fs/promises";

export type EnvironmentSecretBinding = Readonly<{
  valueVariable: string;
  fileVariable?: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;
type AsyncSecretFileReader = (path: string) => Promise<string>;
type SyncSecretFileReader = (path: string) => string;

type EnvironmentSecretSource =
  | Readonly<{kind: "value"; value: string}>
  | Readonly<{kind: "file"; path: string; variable: string}>;

export class InvalidEnvironmentSecretConfigurationError extends Error {
  readonly name = "InvalidEnvironmentSecretConfigurationError";
}

function invalid(message: string): InvalidEnvironmentSecretConfigurationError {
  return new InvalidEnvironmentSecretConfigurationError(message);
}

function selectSecretSource(binding: EnvironmentSecretBinding, environment: Environment): EnvironmentSecretSource {
  const value = environment[binding.valueVariable]?.trim();
  const path = binding.fileVariable === undefined ? undefined : environment[binding.fileVariable]?.trim();

  if (value && path) {
    throw invalid(`${binding.valueVariable} and ${binding.fileVariable} cannot both be configured.`);
  }
  if (path && binding.fileVariable) return Object.freeze({kind: "file", path, variable: binding.fileVariable});
  if (value) return Object.freeze({kind: "value", value});

  const acceptedVariables = binding.fileVariable
    ? `${binding.valueVariable} or ${binding.fileVariable}`
    : binding.valueVariable;
  throw invalid(`${acceptedVariables} is required.`);
}

function nonEmptyFileSecret(content: string, fileVariable: string): string {
  const secret = content.trim();
  if (!secret) throw invalid(`${fileVariable} must reference a non-empty secret file.`);
  return secret;
}

export async function readEnvironmentSecret(
  binding: EnvironmentSecretBinding,
  environment: Environment = process.env,
  readSecretFile: AsyncSecretFileReader = (path) => readFile(path, "utf8"),
): Promise<string> {
  const source = selectSecretSource(binding, environment);
  if (source.kind === "value") return source.value;

  try {
    return nonEmptyFileSecret(await readSecretFile(source.path), source.variable);
  } catch (error) {
    if (error instanceof InvalidEnvironmentSecretConfigurationError) throw error;
    throw invalid(`${source.variable} could not be read.`);
  }
}

export function readEnvironmentSecretSync(
  binding: EnvironmentSecretBinding,
  environment: Environment = process.env,
  readSecretFile: SyncSecretFileReader = (path) => readFileSync(path, "utf8"),
): string {
  const source = selectSecretSource(binding, environment);
  if (source.kind === "value") return source.value;

  try {
    return nonEmptyFileSecret(readSecretFile(source.path), source.variable);
  } catch (error) {
    if (error instanceof InvalidEnvironmentSecretConfigurationError) throw error;
    throw invalid(`${source.variable} could not be read.`);
  }
}
