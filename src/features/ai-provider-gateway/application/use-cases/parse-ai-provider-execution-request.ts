import {aiProviderCapabilities, type AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import {aiProviderMessageRoles, type AiProviderExecutionRequest, type AiProviderMessage} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

const executionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const executableCapabilities: readonly AiProviderCapability[] = ["TEXT_GENERATION", "TRANSLATION"];
const maxMessageCharacters = 32_000;
const maxTotalCharacters = 128_000;

function invalid(): never { throw new AiProviderFailure("INVALID_REQUEST"); }
function isAiProviderCapability(value: unknown): value is AiProviderCapability {
  return typeof value === "string" && (aiProviderCapabilities as readonly string[]).includes(value);
}
function isAiProviderMessageRole(value: unknown): value is AiProviderMessage["role"] {
  return typeof value === "string" && (aiProviderMessageRoles as readonly string[]).includes(value);
}
function parseContent(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxMessageCharacters) return invalid();
  return value;
}
function parseMessages(value: unknown): readonly AiProviderMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return invalid();
  let total = 0;
  const messages = value.map((message): AiProviderMessage => {
    if (typeof message !== "object" || message === null || Array.isArray(message)) return invalid();
    const record = message as Readonly<Record<string, unknown>>;
    if (Object.keys(record).some((key) => key !== "role" && key !== "content")) return invalid();
    if (!isAiProviderMessageRole(record.role)) return invalid();
    const content = parseContent(record.content); total += content.length;
    return Object.freeze({role: record.role, content});
  });
  if (total > maxTotalCharacters) return invalid();
  return Object.freeze(messages);
}
function optionalNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) return invalid();
  return value;
}

export type ExecuteAiProviderRequestInput = Readonly<{
  executionId: unknown;
  capability: unknown;
  messages: unknown;
  systemInstruction?: unknown;
  generationSettings?: unknown;
  timeoutMs?: unknown;
  signal?: AbortSignal;
}>;

export function parseAiProviderExecutionRequest(input: ExecuteAiProviderRequestInput): AiProviderExecutionRequest {
  if (typeof input.executionId !== "string" || !executionIdPattern.test(input.executionId)) return invalid();
  if (!isAiProviderCapability(input.capability)) return invalid();
  if (!(executableCapabilities as readonly string[]).includes(input.capability)) return invalid();
  const systemInstruction = input.systemInstruction === undefined ? undefined : parseContent(input.systemInstruction);
  let generationSettings: AiProviderExecutionRequest["generationSettings"];
  if (input.generationSettings !== undefined) {
    if (typeof input.generationSettings !== "object" || input.generationSettings === null || Array.isArray(input.generationSettings)) return invalid();
    const record = input.generationSettings as Readonly<Record<string, unknown>>;
    if (Object.keys(record).some((key) => !["temperature", "topP", "maxOutputTokens"].includes(key))) return invalid();
    generationSettings = Object.freeze({
      temperature: optionalNumber(record.temperature, 0, 2),
      topP: optionalNumber(record.topP, 0, 1),
      maxOutputTokens: optionalNumber(record.maxOutputTokens, 1, 131_072),
    });
  }
  const timeoutMs = input.timeoutMs === undefined ? 15_000 : optionalNumber(input.timeoutMs, 100, 60_000);
  if (timeoutMs === undefined || !Number.isInteger(timeoutMs)) return invalid();
  return Object.freeze({
    executionId: input.executionId,
    capability: input.capability,
    messages: parseMessages(input.messages),
    ...(systemInstruction === undefined ? {} : {systemInstruction}),
    ...(generationSettings === undefined ? {} : {generationSettings}),
    timeoutMs,
  });
}
