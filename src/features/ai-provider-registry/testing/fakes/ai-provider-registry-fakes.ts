import type {AiProviderRegistryEventDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import type {AiProviderRegistryClock, AiProviderRegistryEvent, AiProviderRegistryEventIdGenerator, AiProviderRegistryRepository, AiProviderRegistrySnapshot, AiRegistrySaveResult} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";
import type {AiCredentialReference} from "@/features/ai-provider-registry/domain/entities/ai-credential-reference";
import type {AiModelProfile} from "@/features/ai-provider-registry/domain/entities/ai-model-profile";
import type {AiProviderConfiguration} from "@/features/ai-provider-registry/domain/entities/ai-provider-configuration";

export class FakeAiProviderRegistryRepository implements AiProviderRegistryRepository {
  providers: AiProviderConfiguration[] = []; profiles: AiModelProfile[] = []; credentialReferences: AiCredentialReference[] = []; events: AiProviderRegistryEvent[] = []; eventDtos: AiProviderRegistryEventDto[] = [];
  saveResult: AiRegistrySaveResult = "saved";
  async read(): Promise<AiProviderRegistrySnapshot> { return {providers: this.providers, profiles: this.profiles, credentialReferences: this.credentialReferences}; }
  async findProvider(id: string) { return this.providers.find((item) => item.id === id) ?? null; }
  async findProfile(id: string) { return this.profiles.find((item) => item.id === id) ?? null; }
  async findCredentialReference(id: string) { return this.credentialReferences.find((item) => item.id === id) ?? null; }
  async saveProvider(value: AiProviderConfiguration, event: AiProviderRegistryEvent, expected: number) { return this.save(this.providers, value, event, expected); }
  async saveProfile(value: AiModelProfile, event: AiProviderRegistryEvent, expected: number) { if (!this.providers.some((item) => item.id === value.providerId)) return "missing_parent" as const; return this.save(this.profiles, value, event, expected); }
  async saveCredentialReference(value: AiCredentialReference, event: AiProviderRegistryEvent, expected: number) { if (!this.providers.some((item) => item.id === value.providerId)) return "missing_parent" as const; return this.save(this.credentialReferences, value, event, expected); }
  async readEvents(limit: number) { return this.eventDtos.slice(0, limit); }
  private save<T extends {id: string; version: number}>(collection: T[], value: T, event: AiProviderRegistryEvent, expected: number): AiRegistrySaveResult { if (this.saveResult !== "saved") return this.saveResult; const index = collection.findIndex((item) => item.id === value.id); if ((index < 0 ? 0 : collection[index]!.version) !== expected) return "conflict"; if (index < 0) collection.push(value); else collection[index] = value; this.events.push(event); return "saved"; }
}
export class FakeAiProviderRegistryClock implements AiProviderRegistryClock { constructor(public instant = new Date("2026-09-01T12:00:00.000Z")) {} now() { return new Date(this.instant); } }
export class FakeAiProviderRegistryEventIdGenerator implements AiProviderRegistryEventIdGenerator { private value = 0; generate() { return `aipre_test-${++this.value}`; } }
