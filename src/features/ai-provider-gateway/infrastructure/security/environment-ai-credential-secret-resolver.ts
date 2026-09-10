import type {AiCredentialSecretResolver} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import {readEnvironmentSecret} from "@/shared/infrastructure/config/environment-secret";

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
    private readonly readSecretFile?: SecretFileReader,
  ) {}

  async resolve(credentialReference: string): Promise<string> {
    const binding = this.bindings[credentialReference];
    if (!binding) throw new AiProviderFailure("MISSING_SECRET");
    try {
      return await readEnvironmentSecret({
        valueVariable: binding.environmentVariable,
        fileVariable: binding.fileEnvironmentVariable,
      }, this.environment, this.readSecretFile);
    } catch (error) {
      if (error instanceof AiProviderFailure) throw error;
      throw new AiProviderFailure("MISSING_SECRET");
    }
  }
}
