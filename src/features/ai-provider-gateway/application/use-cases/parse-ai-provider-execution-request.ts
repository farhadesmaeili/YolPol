import {aiProviderCapabilities, type AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import type {AiProviderExecutionRequest, AiProviderMessage, AiProviderToolCall, AiProviderToolDefinition} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

const executionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const toolIdentifierPattern = /^[A-Za-z0-9_-]{1,64}$/;
const executableCapabilities: readonly AiProviderCapability[] = ["TEXT_GENERATION", "TRANSLATION", "TOOL_CALLING"];
const maxMessageCharacters = 32_000;
const maxTotalCharacters = 128_000;

function invalid(): never { throw new AiProviderFailure("INVALID_REQUEST"); }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function isCapability(value: unknown): value is AiProviderCapability { return typeof value === "string" && (aiProviderCapabilities as readonly string[]).includes(value); }
function parseContent(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0) || value.length > maxMessageCharacters) return invalid();
  return value;
}
function parseToolCall(value: unknown): AiProviderToolCall {
  if (!isRecord(value) || !exactKeys(value, ["id", "name", "arguments"])) return invalid();
  if (typeof value.id !== "string" || !toolIdentifierPattern.test(value.id)) return invalid();
  if (typeof value.name !== "string" || !toolIdentifierPattern.test(value.name)) return invalid();
  return Object.freeze({id: value.id, name: value.name, arguments: parseContent(value.arguments)});
}
function parseMessages(value: unknown): readonly AiProviderMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return invalid();
  let total = 0;
  const messages = value.map((message): AiProviderMessage => {
    if (!isRecord(message) || typeof message.role !== "string") return invalid();
    if (message.role === "TOOL") {
      if (!exactKeys(message, ["role", "content", "toolCallId", "name"])) return invalid();
      if (typeof message.toolCallId !== "string" || !toolIdentifierPattern.test(message.toolCallId)) return invalid();
      if (typeof message.name !== "string" || !toolIdentifierPattern.test(message.name)) return invalid();
      const content = parseContent(message.content); total += content.length;
      return Object.freeze({role: "TOOL", content, toolCallId: message.toolCallId, name: message.name});
    }
    if (message.role !== "SYSTEM" && message.role !== "USER" && message.role !== "ASSISTANT") return invalid();
    if (!exactKeys(message, ["role", "content", "toolCalls"])) return invalid();
    const toolCalls = message.toolCalls === undefined ? undefined : (() => {
      if (message.role !== "ASSISTANT" || !Array.isArray(message.toolCalls) || message.toolCalls.length < 1 || message.toolCalls.length > 16) return invalid();
      const calls = message.toolCalls.map(parseToolCall);
      total += calls.reduce((sum, call) => sum + call.arguments.length, 0);
      return Object.freeze(calls);
    })();
    const content = parseContent(message.content, toolCalls !== undefined); total += content.length;
    return Object.freeze({role: message.role, content, ...(toolCalls === undefined ? {} : {toolCalls})});
  });
  if (total > maxTotalCharacters) return invalid();
  return Object.freeze(messages);
}

function validateToolConversation(messages: readonly AiProviderMessage[], tools: readonly AiProviderToolDefinition[] | undefined): void {
  const pending = new Map<string, string>();
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role === "TOOL") {
      if (!tools || pending.get(message.toolCallId) !== message.name) return invalid();
      pending.delete(message.toolCallId);
      continue;
    }
    if (pending.size > 0) return invalid();
    if (message.toolCalls) {
      if (!tools) return invalid();
      for (const call of message.toolCalls) {
        if (seen.has(call.id) || !tools.some((tool) => tool.name === call.name)) return invalid();
        seen.add(call.id);
        pending.set(call.id, call.name);
      }
    }
  }
  if (pending.size > 0) return invalid();
}
function parseCapabilities(primary: AiProviderCapability, value: unknown): readonly AiProviderCapability[] {
  if (value === undefined) return Object.freeze([primary]);
  if (!Array.isArray(value) || value.length < 1 || value.length > aiProviderCapabilities.length) return invalid();
  const capabilities = value.map((capability) => {
    if (!isCapability(capability) || !executableCapabilities.includes(capability)) return invalid();
    return capability;
  });
  if (!capabilities.includes(primary) || new Set(capabilities).size !== capabilities.length) return invalid();
  return Object.freeze(capabilities);
}
function parseToolDefinition(value: unknown): AiProviderToolDefinition {
  if (!isRecord(value) || !exactKeys(value, ["name", "description", "inputSchema"])) return invalid();
  if (typeof value.name !== "string" || !toolIdentifierPattern.test(value.name)) return invalid();
  if (typeof value.description !== "string" || value.description.trim().length === 0 || value.description.length > 1_000) return invalid();
  if (!isRecord(value.inputSchema) || value.inputSchema.type !== "object" || value.inputSchema.additionalProperties !== false) return invalid();
  if (JSON.stringify(value.inputSchema).length > 16_000) return invalid();
  return Object.freeze({name: value.name, description: value.description, inputSchema: Object.freeze({...value.inputSchema})});
}
function parseTools(value: unknown): readonly AiProviderToolDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) return invalid();
  const tools = value.map(parseToolDefinition);
  if (new Set(tools.map(({name}) => name)).size !== tools.length) return invalid();
  return Object.freeze(tools);
}
function optionalNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) return invalid();
  return value;
}

export type ExecuteAiProviderRequestInput = Readonly<{
  executionId: unknown;
  capability: unknown;
  requiredCapabilities?: unknown;
  messages: unknown;
  tools?: unknown;
  toolChoice?: unknown;
  systemInstruction?: unknown;
  generationSettings?: unknown;
  timeoutMs?: unknown;
  signal?: AbortSignal;
}>;

export function parseAiProviderExecutionRequest(input: ExecuteAiProviderRequestInput): AiProviderExecutionRequest {
  if (typeof input.executionId !== "string" || !executionIdPattern.test(input.executionId)) return invalid();
  if (!isCapability(input.capability) || !executableCapabilities.includes(input.capability)) return invalid();
  const requiredCapabilities = parseCapabilities(input.capability, input.requiredCapabilities);
  const tools = parseTools(input.tools);
  if ((input.capability === "TOOL_CALLING" || requiredCapabilities.includes("TOOL_CALLING")) && !tools) return invalid();
  if (tools && !requiredCapabilities.includes("TOOL_CALLING")) return invalid();
  const toolChoice = input.toolChoice === undefined ? (tools ? "AUTO" : undefined) : input.toolChoice;
  if (toolChoice !== undefined && toolChoice !== "AUTO" && toolChoice !== "NONE") return invalid();
  if (toolChoice !== undefined && !tools) return invalid();
  const messages = parseMessages(input.messages);
  validateToolConversation(messages, tools);
  const systemInstruction = input.systemInstruction === undefined ? undefined : parseContent(input.systemInstruction);
  let generationSettings: AiProviderExecutionRequest["generationSettings"];
  if (input.generationSettings !== undefined) {
    if (!isRecord(input.generationSettings) || !exactKeys(input.generationSettings, ["temperature", "topP", "maxOutputTokens"])) return invalid();
    generationSettings = Object.freeze({
      temperature: optionalNumber(input.generationSettings.temperature, 0, 2),
      topP: optionalNumber(input.generationSettings.topP, 0, 1),
      maxOutputTokens: optionalNumber(input.generationSettings.maxOutputTokens, 1, 131_072),
    });
  }
  const timeoutMs = input.timeoutMs === undefined ? 15_000 : optionalNumber(input.timeoutMs, 100, 60_000);
  if (timeoutMs === undefined || !Number.isInteger(timeoutMs)) return invalid();
  return Object.freeze({
    executionId: input.executionId,
    capability: input.capability,
    requiredCapabilities,
    messages,
    ...(tools === undefined ? {} : {tools}),
    ...(toolChoice === undefined ? {} : {toolChoice}),
    ...(systemInstruction === undefined ? {} : {systemInstruction}),
    ...(generationSettings === undefined ? {} : {generationSettings}),
    timeoutMs,
  });
}
