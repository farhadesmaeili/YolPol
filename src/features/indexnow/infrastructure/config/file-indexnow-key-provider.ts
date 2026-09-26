import {readFile} from "node:fs/promises";

import type {IndexNowKeyProvider} from "@/features/indexnow/application/ports/indexnow-key-provider";
import {
  InvalidIndexNowKeyError,
  parseIndexNowKey,
  type IndexNowKey,
} from "@/features/indexnow/domain/value-objects/indexnow-key";

export const indexNowKeyFileEnvironmentVariable = "INDEXNOW_KEY_FILE";

type Environment = Readonly<Record<string, string | undefined>>;
type SecretFileReader = (path: string) => Promise<string>;

export class InvalidIndexNowKeyConfigurationError extends Error {
  readonly name = "InvalidIndexNowKeyConfigurationError";

  constructor() {
    super("IndexNow key configuration is unavailable.");
  }
}

function trimSafeSurroundingWhitespace(value: string): string {
  return value.replace(/^[\t\n\r ]+|[\t\n\r ]+$/gu, "");
}

export async function readFileBackedIndexNowKey(
  environment: Environment = process.env,
  readSecretFile: SecretFileReader = (path) => readFile(path, "utf8"),
): Promise<IndexNowKey> {
  const path = environment[indexNowKeyFileEnvironmentVariable]?.trim();
  if (!path) throw new InvalidIndexNowKeyConfigurationError();

  try {
    return parseIndexNowKey(trimSafeSurroundingWhitespace(await readSecretFile(path)));
  } catch (error) {
    if (error instanceof InvalidIndexNowKeyError) throw new InvalidIndexNowKeyConfigurationError();
    throw new InvalidIndexNowKeyConfigurationError();
  }
}

export class FileIndexNowKeyProvider implements IndexNowKeyProvider {
  constructor(
    private readonly environment: Environment = process.env,
    private readonly readSecretFile: SecretFileReader = (path) => readFile(path, "utf8"),
  ) {}

  readKey(): Promise<IndexNowKey> {
    return readFileBackedIndexNowKey(this.environment, this.readSecretFile);
  }
}
