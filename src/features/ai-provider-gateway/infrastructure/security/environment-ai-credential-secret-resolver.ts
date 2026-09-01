import "server-only";

import {readFile} from "node:fs/promises";

import type {AiCredentialSecretResolver} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";

export type AiCredentialSecretBinding = Readonly<{
  environmentVariable: string;
  fileEnvironmentVariable?: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;
type SecretFileReader = (path: string) => Promise<string>;

export class EnvironmentAiCredentialSecretResolver implements AiCredentialSecretResolver {
  constructor(
    private readonly bindings: Readonly<Record<string, AiCredentialSecretBinding>>,
    private readonly environment: Environment = process.env,
    private readonly readSecretFile: SecretFileReader = (path) => readFile(path, "utf8"),
  ) {}

  async resolve(credentialReference: string): Promise<string> {
    const binding = this.bindings[credentialReference];
    if (!binding) throw new AiProviderFailure("MISSING_SECRET");
    try {
      const filePath = binding.fileEnvironmentVariable ? this.environment[binding.fileEnvironmentVariable]?.trim() : undefined;
      const rawValue = filePath ? await this.readSecretFile(filePath) : this.environment[binding.environmentVariable];
      const secret = rawValue?.trim();
      if (!secret) throw new AiProviderFailure("MISSING_SECRET");
      return secret;
    } catch (error) {
      if (error instanceof AiProviderFailure) throw error;
      throw new AiProviderFailure("MISSING_SECRET");
    }
  }
}
