import {AiProviderRegistryValidationError} from "@/features/ai-provider-registry/domain/errors/ai-provider-registry-errors";
import {aiProviderCapabilities, type AiGenerationSettings, type AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

export const maximumAiRegistryPriority = 1_000_000;
const stableIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const adapterKeyPattern = /^[a-z][a-z0-9-]{0,47}$/u;
const credentialReferencePattern = /^(?:[a-z][a-z0-9-]{1,63}|secret:\/\/[a-z][a-z0-9-]{1,31}(?:\/[a-z0-9][a-z0-9-]{0,31}){1,4})$/u;
const actorReferencePattern = /^staff:[A-Za-z0-9_-]{1,128}$/u;

function plainText(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string") throw new AiProviderRegistryValidationError(field, `${field} is invalid.`);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximumLength || /[<>\u0000-\u001F\u007F]/u.test(normalized)) {
    throw new AiProviderRegistryValidationError(field, `${field} is invalid.`);
  }
  return normalized;
}

export function parseAiRegistryStableId(value: unknown, field: string): string {
  if (typeof value !== "string" || !stableIdPattern.test(value)) throw new AiProviderRegistryValidationError(field, `${field} is invalid.`);
  return value;
}

export function parseAiProviderAdapterKey(value: unknown): string {
  if (typeof value !== "string" || !adapterKeyPattern.test(value)) throw new AiProviderRegistryValidationError("adapterKey", "Provider adapter key is invalid.");
  return value;
}

export function parseAiRegistryDisplayName(value: unknown, field: string): string { return plainText(value, field, 120); }

export function parseAiProviderModelIdentifier(value: unknown): string {
  const parsed = plainText(value, "modelIdentifier", 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(parsed)) throw new AiProviderRegistryValidationError("modelIdentifier", "Provider model identifier is invalid.");
  return parsed;
}

export function parseAiCredentialReference(value: unknown): string {
  if (typeof value !== "string" || !credentialReferencePattern.test(value)) throw new AiProviderRegistryValidationError("credentialReference", "Credential reference must be a safe opaque reference.");
  const forbiddenPrefixes = [["g", "s", "k", "-"].join(""), ["s", "k", "-"].join(""), ["b", "e", "a", "r", "e", "r", "-"].join("")];
  if (forbiddenPrefixes.some((prefix) => value.toLowerCase().startsWith(prefix))) throw new AiProviderRegistryValidationError("credentialReference", "Credential reference resembles credential material.");
  return value;
}

export function parseAiRegistryPriority(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximumAiRegistryPriority) throw new AiProviderRegistryValidationError("priority", "Priority is invalid.");
  return value as number;
}

export function parseAiRegistryVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) throw new AiProviderRegistryValidationError("version", "Version is invalid.");
  return value as number;
}

export function parseAiRegistryDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new AiProviderRegistryValidationError(field, `${field} is invalid.`);
  return new Date(value);
}

export function parseAiRegistryActor(value: unknown): string {
  if (typeof value !== "string" || !actorReferencePattern.test(value)) throw new AiProviderRegistryValidationError("updatedBy", "Actor reference is invalid.");
  return value;
}

export function parseAiRegistryEnabled(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AiProviderRegistryValidationError("enabled", "Enabled state is invalid.");
  return value;
}

export function parseAiProviderCapabilities(value: unknown): readonly AiProviderCapability[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > aiProviderCapabilities.length) throw new AiProviderRegistryValidationError("capabilities", "Capabilities are invalid.");
  const parsed = value.map((item) => {
    if (typeof item !== "string" || !(aiProviderCapabilities as readonly string[]).includes(item)) throw new AiProviderRegistryValidationError("capabilities", "Capabilities are invalid.");
    return item as AiProviderCapability;
  });
  if (new Set(parsed).size !== parsed.length) throw new AiProviderRegistryValidationError("capabilities", "Capabilities must be unique.");
  return Object.freeze([...parsed].sort((left, right) => aiProviderCapabilities.indexOf(left) - aiProviderCapabilities.indexOf(right)));
}

function nullableDecimal(value: unknown, field: string, maximum: number): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) throw new AiProviderRegistryValidationError(field, `${field} is invalid.`);
  return value;
}

export function parseAiGenerationSettings(value: unknown): AiGenerationSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new AiProviderRegistryValidationError("generationSettings", "Generation settings are invalid.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "maxOutputTokens,temperature,topP") throw new AiProviderRegistryValidationError("generationSettings", "Generation settings contain unsupported fields.");
  if (!Number.isSafeInteger(record.maxOutputTokens) || (record.maxOutputTokens as number) < 1 || (record.maxOutputTokens as number) > 131_072) throw new AiProviderRegistryValidationError("maxOutputTokens", "Maximum output tokens are invalid.");
  return Object.freeze({temperature: nullableDecimal(record.temperature, "temperature", 2), topP: nullableDecimal(record.topP, "topP", 1), maxOutputTokens: record.maxOutputTokens as number});
}
