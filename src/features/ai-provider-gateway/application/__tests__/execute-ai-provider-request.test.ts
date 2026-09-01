import {describe, expect, it} from "vitest";

import type {
  AiProviderAdapter,
  AiProviderAdapterExecution,
  AiProviderAdapterResult,
  AiProviderExecutionCandidate,
  AiRuntimeHealthRepository,
} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {ExecuteAiProviderRequest} from "@/features/ai-provider-gateway/application/use-cases/execute-ai-provider-request";
import {AiProviderFailure, AiProviderGatewayError} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import type {AiRuntimeHealthPermit, AiRuntimeHealthSnapshot, AiRuntimeHealthTarget} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import {AiProviderRegistryCandidateSource} from "@/features/ai-provider-gateway/infrastructure/registry/ai-provider-registry-candidate-source";

const success = (content: string): AiProviderAdapterResult => Object.freeze({content, finishReason: "STOP", providerRequestId: `request-${content}`, tokenUsage: {inputTokens: 2, outputTokens: 3, totalTokens: 5}});
const request = Object.freeze({executionId: "execution-a", capability: "TEXT_GENERATION", messages: [{role: "USER", content: "customer text"}]});

function candidate(id: string, credentials = ["primary"], adapterKey = "groq"): AiProviderExecutionCandidate {
  return Object.freeze({
    providerConfigurationId: `provider-${id}`,
    modelProfileId: `profile-${id}`,
    adapterKey,
    providerModelIdentifier: `model/${id}`,
    generationSettings: Object.freeze({temperature: 0.2, topP: null, maxOutputTokens: 512}),
    credentialReferences: Object.freeze(credentials.map((credential) => Object.freeze({id: `${id}-${credential}`, credentialReference: `secret://${id}/${credential}`}))),
  });
}

const targetKey = (target: AiRuntimeHealthTarget) => `${target.providerConfigurationId}|${target.modelProfileId}|${target.credentialReferenceId}`;

class FakeHealthRepository implements AiRuntimeHealthRepository {
  readonly open = new Set<string>();
  readonly successes: AiRuntimeHealthPermit[] = [];
  readonly qualifyingFailures: AiRuntimeHealthPermit[] = [];
  readonly releases: AiRuntimeHealthPermit[] = [];
  private version = 0;

  async acquire(target: AiRuntimeHealthTarget): Promise<AiRuntimeHealthPermit | null> {
    if (this.open.has(targetKey(target))) return null;
    return Object.freeze({target, version: ++this.version, halfOpenProbe: false});
  }
  async recordSuccess(permit: AiRuntimeHealthPermit): Promise<boolean> { this.successes.push(permit); return true; }
  async recordQualifyingFailure(permit: AiRuntimeHealthPermit): Promise<boolean> { this.qualifyingFailures.push(permit); return true; }
  async releaseWithoutHealthChange(permit: AiRuntimeHealthPermit): Promise<boolean> { this.releases.push(permit); return true; }
  async read(): Promise<AiRuntimeHealthSnapshot | null> { return null; }
}

class SequenceAdapter implements AiProviderAdapter {
  readonly adapterKey = "groq";
  readonly calls: AiProviderAdapterExecution[] = [];
  constructor(private readonly outcomes: (AiProviderAdapterResult | AiProviderFailure)[]) {}
  async execute(input: AiProviderAdapterExecution): Promise<AiProviderAdapterResult> {
    this.calls.push(input);
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error("Missing test outcome.");
    if (outcome instanceof AiProviderFailure) throw outcome;
    return outcome;
  }
}

function harness(candidates: readonly AiProviderExecutionCandidate[], outcomes: (AiProviderAdapterResult | AiProviderFailure)[], open: readonly AiRuntimeHealthTarget[] = []) {
  const adapter = new SequenceAdapter(outcomes);
  const health = new FakeHealthRepository();
  for (const target of open) health.open.add(targetKey(target));
  let milliseconds = Date.parse("2026-09-01T00:00:00.000Z");
  const sleeps: number[] = [];
  const useCase = new ExecuteAiProviderRequest({
    candidates: {getEligibleCandidates: async () => candidates},
    adapters: {resolve: (key) => key === "groq" ? adapter : null},
    health,
    clock: {now: () => new Date(milliseconds += 10)},
    sleeper: {sleep: async (delay) => { sleeps.push(delay); }},
  });
  return {useCase, adapter, health, sleeps};
}

async function gatewayFailure(promise: Promise<unknown>): Promise<AiProviderGatewayError> {
  const error = await promise.catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(AiProviderGatewayError);
  return error as AiProviderGatewayError;
}

describe("ExecuteAiProviderRequest", () => {
  it("fails over from a transiently failing primary credential to its backup after one bounded retry", async () => {
    const {useCase, adapter, health, sleeps} = harness([candidate("a", ["primary", "backup"])], [
      new AiProviderFailure("NETWORK"), new AiProviderFailure("NETWORK"), success("backup"),
    ]);
    const result = await useCase.execute(request);
    expect(adapter.calls.map(({credentialReference}) => credentialReference)).toEqual(["secret://a/primary", "secret://a/primary", "secret://a/backup"]);
    expect(sleeps).toEqual([100]);
    expect(health.qualifyingFailures).toHaveLength(2);
    expect(result).toMatchObject({content: "backup", credentialReferenceId: "a-backup"});
    expect(result.attempts.map(({outcome}) => outcome)).toEqual(["FAILURE", "FAILURE", "SUCCESS"]);
  });

  it("moves to the next eligible profile/provider after all credentials fail transiently", async () => {
    const {useCase, adapter} = harness([candidate("a", ["primary", "backup"]), candidate("b")], [
      new AiProviderFailure("TIMEOUT"), new AiProviderFailure("TIMEOUT"),
      new AiProviderFailure("NETWORK"), new AiProviderFailure("NETWORK"), success("provider-b"),
    ]);
    const result = await useCase.execute(request);
    expect(adapter.calls).toHaveLength(5);
    expect(result.providerConfigurationId).toBe("provider-b");
  });

  it("retries a rate limit once, respects bounded retry-after, then moves to the next candidate without rotating keys", async () => {
    const {useCase, adapter, sleeps} = harness([candidate("a", ["primary", "backup"]), candidate("b")], [
      new AiProviderFailure("RATE_LIMIT", 50_000), new AiProviderFailure("RATE_LIMIT", 50_000), success("provider-b"),
    ]);
    const result = await useCase.execute(request);
    expect(sleeps).toEqual([2_000]);
    expect(adapter.calls.map(({credentialReference}) => credentialReference)).toEqual(["secret://a/primary", "secret://a/primary", "secret://b/primary"]);
    expect(result.providerConfigurationId).toBe("provider-b");
  });

  it.each(["INVALID_REQUEST", "SAFETY_REJECTION", "UNKNOWN_PROVIDER_ERROR"] as const)("keeps %s terminal with no retry or failover and no health poisoning", async (category) => {
    const {useCase, adapter, health, sleeps} = harness([candidate("a"), candidate("b")], [new AiProviderFailure(category), success("must-not-run")]);
    const failure = await gatewayFailure(useCase.execute(request));
    expect(failure.category).toBe(category);
    expect(adapter.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(health.qualifyingFailures).toEqual([]);
    expect(health.releases).toHaveLength(1);
  });

  it("moves from a missing secret to the next credential without retry", async () => {
    const {useCase, adapter, sleeps} = harness([candidate("a", ["primary", "backup"])], [new AiProviderFailure("MISSING_SECRET"), success("backup")]);
    expect((await useCase.execute(request)).credentialReferenceId).toBe("a-backup");
    expect(adapter.calls).toHaveLength(2);
    expect(sleeps).toEqual([]);
  });

  it("records an unsupported adapter safely and attempts the next configured candidate", async () => {
    const {useCase} = harness([candidate("unsupported", ["primary"], "future-adapter"), candidate("b")], [success("provider-b")]);
    const result = await useCase.execute(request);
    expect(result.providerConfigurationId).toBe("provider-b");
    expect(result.attempts[0]).toMatchObject({failureCategory: "UNSUPPORTED_ADAPTER", adapterKey: "future-adapter"});
  });

  it("skips an open target, uses an independent credential, and resets successful health", async () => {
    const value = candidate("a", ["primary", "backup"]);
    const openTarget = {providerConfigurationId: value.providerConfigurationId, modelProfileId: value.modelProfileId, credentialReferenceId: "a-primary"};
    const {useCase, adapter, health} = harness([value], [success("backup")], [openTarget]);
    expect((await useCase.execute(request)).credentialReferenceId).toBe("a-backup");
    expect(adapter.calls).toHaveLength(1);
    expect(health.successes).toHaveLength(1);
  });

  it("reports CIRCUIT_OPEN when every eligible target is open", async () => {
    const value = candidate("a");
    const openTarget = {providerConfigurationId: value.providerConfigurationId, modelProfileId: value.modelProfileId, credentialReferenceId: "a-primary"};
    const {useCase, adapter} = harness([value], [], [openTarget]);
    expect((await gatewayFailure(useCase.execute(request))).category).toBe("CIRCUIT_OPEN");
    expect(adapter.calls).toHaveLength(0);
  });

  it("rejects missing candidates, invalid input, and cancellation before provider execution", async () => {
    const empty = harness([], []);
    expect((await gatewayFailure(empty.useCase.execute(request))).category).toBe("NO_ELIGIBLE_CANDIDATES");
    expect((await gatewayFailure(empty.useCase.execute({...request, messages: []}))).category).toBe("INVALID_REQUEST");
    const cancelled = harness([candidate("a")], [success("must-not-run")]);
    const controller = new AbortController(); controller.abort();
    expect((await gatewayFailure(cancelled.useCase.execute({...request, signal: controller.signal}))).category).toBe("CANCELLED");
    expect(cancelled.adapter.calls).toHaveLength(0);
  });

  it("preserves the Registry eligibility result order without re-sorting", async () => {
    const eligible = [
      {provider: {id: "provider-z", adapterKey: "groq", displayName: "Z", enabled: true, priority: 10, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}, profile: {id: "profile-z", providerId: "provider-z", name: "Z", modelIdentifier: "model/z", enabled: true, priority: 10, capabilities: ["TEXT_GENERATION" as const], generationSettings: {temperature: null, topP: null, maxOutputTokens: 10}, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}, credentialReferences: [{id: "credential-b", providerId: "provider-z", alias: "B", credentialReference: "secret://z/b", enabled: true, priority: 10, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}, {id: "credential-a", providerId: "provider-z", alias: "A", credentialReference: "secret://z/a", enabled: true, priority: 10, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}]},
      {provider: {id: "provider-a", adapterKey: "groq", displayName: "A", enabled: true, priority: 10, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}, profile: {id: "profile-a", providerId: "provider-a", name: "A", modelIdentifier: "model/a", enabled: true, priority: 10, capabilities: ["TEXT_GENERATION" as const], generationSettings: {temperature: null, topP: null, maxOutputTokens: 10}, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}, credentialReferences: [{id: "credential-a", providerId: "provider-a", alias: "A", credentialReference: "secret://a/a", enabled: true, priority: 10, version: 1, createdAt: "", updatedAt: "", updatedBy: "staff:a"}]},
    ];
    const source = new AiProviderRegistryCandidateSource({execute: async () => eligible});
    const mapped = await source.getEligibleCandidates("TEXT_GENERATION");
    expect(mapped.map(({providerConfigurationId}) => providerConfigurationId)).toEqual(["provider-z", "provider-a"]);
    expect(mapped[0]?.credentialReferences.map(({id}) => id)).toEqual(["credential-b", "credential-a"]);
  });
});
