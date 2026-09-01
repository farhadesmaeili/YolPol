import type {
  AiProviderAdapterResolver,
  AiProviderCandidateSource,
  AiProviderExecutionCandidate,
  AiProviderGatewayClock,
  AiProviderGatewaySleeper,
  AiRuntimeHealthRepository,
} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {parseAiProviderExecutionRequest, type ExecuteAiProviderRequestInput} from "@/features/ai-provider-gateway/application/use-cases/parse-ai-provider-execution-request";
import {AiProviderFailure, AiProviderGatewayError} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import {
  calculateAiProviderRetryDelayMs,
  isRetryableAiProviderFailure,
  isTerminalAiProviderFailure,
  qualifiesForAiProviderCircuit,
  shouldMoveToNextCandidate,
} from "@/features/ai-provider-gateway/domain/services/ai-provider-failure-policy";
import type {
  AiProviderExecutionAttempt,
  AiProviderExecutionRequest,
  AiProviderExecutionResult,
  AiProviderFailureCategory,
  AiRuntimeHealthTarget,
} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

const maxAttemptsPerCredential = 2;
const circuitFailureThreshold = 3;
const circuitOpenDurationMs = 30_000;
const halfOpenLeaseMs = 15_000;
const safeExecutionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

type Dependencies = Readonly<{
  candidates: AiProviderCandidateSource;
  adapters: AiProviderAdapterResolver;
  health: AiRuntimeHealthRepository;
  clock: AiProviderGatewayClock;
  sleeper: AiProviderGatewaySleeper;
}>;

function safeExecutionId(value: unknown): string {
  return typeof value === "string" && safeExecutionIdPattern.test(value) ? value : "invalid-execution";
}

function duration(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function targetFor(candidate: AiProviderExecutionCandidate, credentialReferenceId: string): AiRuntimeHealthTarget {
  return Object.freeze({
    providerConfigurationId: candidate.providerConfigurationId,
    modelProfileId: candidate.modelProfileId,
    credentialReferenceId,
  });
}

function failureAttempt(
  attemptNumber: number,
  candidate: AiProviderExecutionCandidate,
  credentialReferenceId: string,
  startedAt: Date,
  finishedAt: Date,
  failure: AiProviderFailure,
): AiProviderExecutionAttempt {
  return Object.freeze({
    attemptNumber,
    providerConfigurationId: candidate.providerConfigurationId,
    modelProfileId: candidate.modelProfileId,
    credentialReferenceId,
    adapterKey: candidate.adapterKey,
    providerModelIdentifier: candidate.providerModelIdentifier,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: duration(startedAt, finishedAt),
    outcome: "FAILURE",
    failureCategory: failure.category,
    ...(failure.providerRequestId === undefined ? {} : {providerRequestId: failure.providerRequestId}),
  });
}

function assertNotCancelled(request: AiProviderExecutionRequest, signal?: AbortSignal): void {
  if (signal?.aborted) throw new AiProviderGatewayError("CANCELLED", request.executionId, Object.freeze([]));
}

export class ExecuteAiProviderRequest {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: ExecuteAiProviderRequestInput): Promise<AiProviderExecutionResult> {
    let request: AiProviderExecutionRequest;
    try {
      request = parseAiProviderExecutionRequest(input);
    } catch (error) {
      const category = error instanceof AiProviderFailure ? error.category : "INVALID_REQUEST";
      throw new AiProviderGatewayError(category, safeExecutionId(input.executionId), Object.freeze([]));
    }
    assertNotCancelled(request, input.signal);

    const candidates = await this.dependencies.candidates.getEligibleCandidates(request.capability);
    if (candidates.length === 0) throw new AiProviderGatewayError("NO_ELIGIBLE_CANDIDATES", request.executionId, Object.freeze([]));

    const attempts: AiProviderExecutionAttempt[] = [];
    let attemptNumber = 0;
    let lastCategory: AiProviderFailureCategory | undefined;
    let skippedOpenCircuit = false;

    candidateLoop: for (const candidate of candidates) {
      const adapter = this.dependencies.adapters.resolve(candidate.adapterKey);
      if (!adapter) {
        const now = this.dependencies.clock.now();
        const failure = new AiProviderFailure("UNSUPPORTED_ADAPTER");
        attempts.push(failureAttempt(++attemptNumber, candidate, candidate.credentialReferences[0]?.id ?? "unavailable", now, now, failure));
        lastCategory = failure.category;
        continue;
      }

      for (const credential of candidate.credentialReferences) {
        let retryAfterMs: number | undefined;
        for (let retryIndex = 0; retryIndex < maxAttemptsPerCredential; retryIndex += 1) {
          assertNotCancelled(request, input.signal);
          if (retryIndex > 0) {
            try {
              await this.dependencies.sleeper.sleep(calculateAiProviderRetryDelayMs(retryIndex - 1, retryAfterMs), input.signal);
            } catch {
              throw new AiProviderGatewayError("CANCELLED", request.executionId, Object.freeze([...attempts]));
            }
            assertNotCancelled(request, input.signal);
          }

          const target = targetFor(candidate, credential.id);
          const permit = await this.dependencies.health.acquire(target, this.dependencies.clock.now(), halfOpenLeaseMs);
          if (!permit) { skippedOpenCircuit = true; break; }

          const startedAt = this.dependencies.clock.now();
          try {
            const result = await adapter.execute({request, candidate, credentialReference: credential.credentialReference, ...(input.signal ? {signal: input.signal} : {})});
            const finishedAt = this.dependencies.clock.now();
            await this.dependencies.health.recordSuccess(permit, finishedAt);
            const successAttempt: AiProviderExecutionAttempt = Object.freeze({
              attemptNumber: ++attemptNumber,
              providerConfigurationId: candidate.providerConfigurationId,
              modelProfileId: candidate.modelProfileId,
              credentialReferenceId: credential.id,
              adapterKey: adapter.adapterKey,
              providerModelIdentifier: candidate.providerModelIdentifier,
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
              durationMs: duration(startedAt, finishedAt),
              outcome: "SUCCESS",
              ...(result.providerRequestId === undefined ? {} : {providerRequestId: result.providerRequestId}),
            });
            attempts.push(successAttempt);
            return Object.freeze({
              executionId: request.executionId,
              content: result.content,
              finishReason: result.finishReason,
              providerConfigurationId: candidate.providerConfigurationId,
              modelProfileId: candidate.modelProfileId,
              credentialReferenceId: credential.id,
              adapterKey: adapter.adapterKey,
              providerModelIdentifier: candidate.providerModelIdentifier,
              ...(result.providerRequestId === undefined ? {} : {providerRequestId: result.providerRequestId}),
              ...(result.tokenUsage === undefined ? {} : {tokenUsage: result.tokenUsage}),
              startedAt: attempts[0]!.startedAt,
              finishedAt: finishedAt.toISOString(),
              durationMs: duration(new Date(attempts[0]!.startedAt), finishedAt),
              attempts: Object.freeze([...attempts]),
            });
          } catch (error) {
            const failure = error instanceof AiProviderFailure ? error : new AiProviderFailure(input.signal?.aborted ? "CANCELLED" : "UNKNOWN_PROVIDER_ERROR");
            const finishedAt = this.dependencies.clock.now();
            attempts.push(failureAttempt(++attemptNumber, candidate, credential.id, startedAt, finishedAt, failure));
            lastCategory = failure.category;
            retryAfterMs = failure.retryAfterMs;
            if (qualifiesForAiProviderCircuit(failure.category)) {
              await this.dependencies.health.recordQualifyingFailure(permit, finishedAt, circuitFailureThreshold, circuitOpenDurationMs);
            } else {
              await this.dependencies.health.releaseWithoutHealthChange(permit, finishedAt);
            }
            if (isTerminalAiProviderFailure(failure.category)) {
              throw new AiProviderGatewayError(failure.category, request.executionId, Object.freeze([...attempts]));
            }
            const canRetry = isRetryableAiProviderFailure(failure.category) && retryIndex + 1 < maxAttemptsPerCredential;
            if (canRetry) continue;
            if (shouldMoveToNextCandidate(failure.category)) continue candidateLoop;
            break;
          }
        }
      }
    }

    throw new AiProviderGatewayError(lastCategory ?? (skippedOpenCircuit ? "CIRCUIT_OPEN" : "NO_ELIGIBLE_CANDIDATES"), request.executionId, Object.freeze([...attempts]));
  }
}
