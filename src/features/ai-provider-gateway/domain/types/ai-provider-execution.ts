import type {AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

export const aiProviderMessageRoles = ["SYSTEM", "USER", "ASSISTANT", "TOOL"] as const;
export type AiProviderMessageRole = (typeof aiProviderMessageRoles)[number];

export type AiProviderToolCall = Readonly<{
  id: string;
  name: string;
  arguments: string;
}>;

export type AiProviderMessage =
  | Readonly<{
      role: "SYSTEM" | "USER" | "ASSISTANT";
      content: string;
      toolCalls?: readonly AiProviderToolCall[];
    }>
  | Readonly<{
      role: "TOOL";
      content: string;
      toolCallId: string;
      name: string;
    }>;

export type AiProviderToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}>;

export type AiProviderExecutionRequest = Readonly<{
  executionId: string;
  capability: AiProviderCapability;
  requiredCapabilities?: readonly AiProviderCapability[];
  messages: readonly AiProviderMessage[];
  tools?: readonly AiProviderToolDefinition[];
  toolChoice?: "AUTO" | "NONE";
  systemInstruction?: string;
  generationSettings?: Readonly<{
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  }>;
  timeoutMs: number;
}>;

export type AiProviderTextMessage = Readonly<{
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
}>;

export type AiProviderFinishReason = "STOP" | "LENGTH" | "TOOL_CALL" | "UNKNOWN";

export type AiProviderTokenUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

export const aiProviderFailureCategories = [
  "INVALID_REQUEST",
  "SAFETY_REJECTION",
  "AUTHENTICATION",
  "PERMISSION",
  "MODEL_NOT_FOUND_OR_CONFIG",
  "RATE_LIMIT",
  "TIMEOUT",
  "NETWORK",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_SERVER_ERROR",
  "MALFORMED_RESPONSE",
  "UNKNOWN_PROVIDER_ERROR",
  "MISSING_SECRET",
  "UNSUPPORTED_ADAPTER",
  "NO_ELIGIBLE_CANDIDATES",
  "CIRCUIT_OPEN",
  "CANCELLED",
] as const;
export type AiProviderFailureCategory = (typeof aiProviderFailureCategories)[number];

export type AiProviderExecutionAttempt = Readonly<{
  attemptNumber: number;
  providerConfigurationId: string;
  modelProfileId: string;
  credentialReferenceId: string;
  adapterKey: string;
  providerModelIdentifier: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: "SUCCESS" | "FAILURE";
  failureCategory?: AiProviderFailureCategory;
  providerRequestId?: string;
}>;

export type AiProviderExecutionResult = Readonly<{
  executionId: string;
  content: string;
  toolCalls?: readonly AiProviderToolCall[];
  finishReason: AiProviderFinishReason;
  providerConfigurationId: string;
  modelProfileId: string;
  credentialReferenceId: string;
  adapterKey: string;
  providerModelIdentifier: string;
  providerRequestId?: string;
  tokenUsage?: AiProviderTokenUsage;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attempts: readonly AiProviderExecutionAttempt[];
}>;

export type AiRuntimeCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type AiRuntimeHealthTarget = Readonly<{
  providerConfigurationId: string;
  modelProfileId: string;
  credentialReferenceId: string;
}>;

export type AiRuntimeHealthPermit = Readonly<{
  target: AiRuntimeHealthTarget;
  version: number;
  halfOpenProbe: boolean;
}>;

export type AiRuntimeHealthSnapshot = AiRuntimeHealthTarget & Readonly<{
  state: AiRuntimeCircuitState;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  openedAt: Date | null;
  openUntil: Date | null;
  halfOpenLeaseUntil: Date | null;
  updatedAt: Date;
  version: number;
}>;
