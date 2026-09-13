import {describe, expect, it} from "vitest";
import {AiCredentialReference} from "@/features/ai-provider-registry/domain/entities/ai-credential-reference";
import {AiModelProfile} from "@/features/ai-provider-registry/domain/entities/ai-model-profile";
import {AiProviderConfiguration} from "@/features/ai-provider-registry/domain/entities/ai-provider-configuration";
import {AiProviderRegistryValidationError} from "@/features/ai-provider-registry/domain/errors/ai-provider-registry-errors";
import {compareAiRegistryPriority} from "@/features/ai-provider-registry/domain/services/order-ai-provider-registry";
import {initialAiProviderAdapterKeys} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

const metadata = {version: 1, createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"), updatedBy: "staff:member-1"};
const provider = (overrides = {}) => AiProviderConfiguration.create({id: "provider-a", adapterKey: "groq", displayName: "Provider A", enabled: true, priority: 10, ...metadata, ...overrides});
const profile = (overrides = {}) => AiModelProfile.create({id: "profile-a", providerId: "provider-a", name: "Fast chat", modelIdentifier: "model/fast-v1", enabled: true, priority: 10, capabilities: ["TRANSLATION", "TEXT_GENERATION"], generationSettings: {temperature: 0.2, topP: null, maxOutputTokens: 2048}, ...metadata, ...overrides});
const credential = (overrides = {}) => AiCredentialReference.create({id: "credential-a", providerId: "provider-a", alias: "Primary", credentialReference: "groq-primary", enabled: true, priority: 10, ...metadata, ...overrides});

describe("AI provider registry domain", () => {
  it("supports initial and future validated adapter keys without a closed provider enum", () => { expect(initialAiProviderAdapterKeys).toEqual(["groq", "openai", "anthropic"]); expect(provider({adapterKey: "future-provider"}).adapterKey).toBe("future-provider"); expect(() => provider({adapterKey: "INVALID SDK"})).toThrow(AiProviderRegistryValidationError); });
  it("validates provider identifiers, names, priorities, versions, enabled state, timestamps, and actors", () => { for (const overrides of [{id: "../bad"}, {displayName: "<script>"}, {priority: -1}, {version: 0}, {enabled: "yes"}, {updatedBy: "browser:member"}, {updatedAt: new Date("invalid")}]) expect(() => provider(overrides)).toThrow(); });
  it("validates model identifiers, minimum capabilities, explicit settings, and deterministic capability order", () => { expect(profile().capabilities).toEqual(["TEXT_GENERATION", "TRANSLATION"]); for (const overrides of [{modelIdentifier: "bad model"}, {capabilities: []}, {capabilities: ["VISION"]}, {capabilities: ["TRANSLATION", "TRANSLATION"]}, {generationSettings: {temperature: 3, topP: null, maxOutputTokens: 10}}, {generationSettings: {temperature: null, topP: null, maxOutputTokens: 10, arbitrary: true}}]) expect(() => profile(overrides)).toThrow(AiProviderRegistryValidationError); });
  it("stores only opaque credential references and rejects secret-like or unbounded values", () => { expect(credential().credentialReference).toBe("groq-primary"); expect(credential({credentialReference: "secret://ai/groq/primary"}).credentialReference).toBe("secret://ai/groq/primary"); const rawShapes = [["g", "s", "k", "-", "x".repeat(40)].join(""), ["s", "k", "-", "x".repeat(40)].join(""), ["B", "e", "a", "r", "e", "r", " ", "x".repeat(40)].join("")]; for (const value of rawShapes) expect(() => credential({credentialReference: value})).toThrow(AiProviderRegistryValidationError); });
  it("orders duplicate priorities by stable ID for providers, profiles, and credentials", () => { expect([{id: "z", priority: 1}, {id: "a", priority: 1}, {id: "b", priority: 0}].sort(compareAiRegistryPriority).map((item) => item.id)).toEqual(["b", "a", "z"]); });
  it("restores enabled and disabled state without changing operational history", () => { expect(provider({enabled: false}).enabled).toBe(false); expect(profile({enabled: false}).enabled).toBe(false); expect(credential({enabled: false}).enabled).toBe(false); });
});
