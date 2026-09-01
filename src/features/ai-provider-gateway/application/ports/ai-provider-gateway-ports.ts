import type {AiGenerationSettings, AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";
import type {
  AiProviderExecutionRequest,
  AiProviderFinishReason,
  AiProviderTokenUsage,
  AiRuntimeHealthPermit,
  AiRuntimeHealthSnapshot,
  AiRuntimeHealthTarget,
} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

export type AiProviderExecutionCandidate = Readonly<{
  providerConfigurationId: string;
  modelProfileId: string;
  adapterKey: string;
  providerModelIdentifier: string;
  generationSettings: AiGenerationSettings;
  credentialReferences: readonly Readonly<{
    id: string;
    credentialReference: string;
  }>[];
}>;

export interface AiProviderCandidateSource {
  getEligibleCandidates(capability: AiProviderCapability): Promise<readonly AiProviderExecutionCandidate[]>;
}

export type AiProviderAdapterExecution = Readonly<{
  request: AiProviderExecutionRequest;
  candidate: AiProviderExecutionCandidate;
  credentialReference: string;
  signal?: AbortSignal;
}>;

export type AiProviderAdapterResult = Readonly<{
  content: string;
  finishReason: AiProviderFinishReason;
  providerRequestId?: string;
  tokenUsage?: AiProviderTokenUsage;
}>;

export interface AiProviderAdapter {
  readonly adapterKey: string;
  execute(input: AiProviderAdapterExecution): Promise<AiProviderAdapterResult>;
}

export interface AiProviderAdapterResolver {
  resolve(adapterKey: string): AiProviderAdapter | null;
}

export interface AiCredentialSecretResolver {
  resolve(credentialReference: string): Promise<string>;
}

export interface AiRuntimeHealthRepository {
  acquire(target: AiRuntimeHealthTarget, now: Date, halfOpenLeaseMs: number): Promise<AiRuntimeHealthPermit | null>;
  recordSuccess(permit: AiRuntimeHealthPermit, now: Date): Promise<boolean>;
  recordQualifyingFailure(permit: AiRuntimeHealthPermit, now: Date, threshold: number, openDurationMs: number): Promise<boolean>;
  releaseWithoutHealthChange(permit: AiRuntimeHealthPermit, now: Date): Promise<boolean>;
  read(target: AiRuntimeHealthTarget): Promise<AiRuntimeHealthSnapshot | null>;
}

export interface AiProviderGatewayClock { now(): Date; }
export interface AiProviderGatewaySleeper { sleep(milliseconds: number, signal?: AbortSignal): Promise<void>; }
