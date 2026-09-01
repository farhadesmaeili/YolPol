import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {toAiCredentialReferenceDto, toAiModelProfileDto, toAiProviderConfigurationDto} from "@/features/ai-provider-registry/application/mappers/ai-provider-registry-dto-mapper";
import type {AiProviderRegistryClock, AiProviderRegistryEntity, AiProviderRegistryEvent, AiProviderRegistryEventIdGenerator, AiProviderRegistryRepository, AiRegistrySaveResult} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";
import {AiCredentialReference} from "@/features/ai-provider-registry/domain/entities/ai-credential-reference";
import {AiModelProfile} from "@/features/ai-provider-registry/domain/entities/ai-model-profile";
import {AiProviderConfiguration} from "@/features/ai-provider-registry/domain/entities/ai-provider-configuration";
import {AiProviderRegistryValidationError} from "@/features/ai-provider-registry/domain/errors/ai-provider-registry-errors";
import type {AiRegistryChangeType, AiRegistryEntityType} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

type Failure = Readonly<{status: "forbidden" | "conflict" | "unavailable"}> | Readonly<{status: "validation_failed"; field: string}>;
type Context = Readonly<{repository: AiProviderRegistryRepository; authorization: StaffAuthorization; clock: AiProviderRegistryClock; eventIds: AiProviderRegistryEventIdGenerator}>;

function expectedVersion(value: unknown): number | null { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 2_147_483_647 ? value as number : null; }
function changeType(previous: Readonly<{enabled: boolean}> | null, next: Readonly<{enabled: boolean}>): AiRegistryChangeType {
  if (!previous) return "CREATED";
  if (previous.enabled !== next.enabled) return next.enabled ? "ENABLED" : "DISABLED";
  return "UPDATED";
}
function event(context: Context, entityType: AiRegistryEntityType, previous: AiProviderRegistryEntity | null, next: AiProviderRegistryEntity, actorReference: string, occurredAt: Date): AiProviderRegistryEvent {
  return {id: context.eventIds.generate(), entityType, entityId: next.id, changeType: changeType(previous, next), previousEntity: previous, newEntity: next, actorReference, occurredAt};
}
function mapSaveFailure(result: AiRegistrySaveResult): Failure | null {
  if (result === "saved") return null;
  if (result === "conflict") return {status: "conflict"};
  if (result === "missing_parent") return {status: "validation_failed", field: "providerId"};
  return {status: "validation_failed", field: "duplicate"};
}
function caught(error: unknown): Failure { return error instanceof AiProviderRegistryValidationError ? {status: "validation_failed", field: error.field} : {status: "unavailable"}; }

export class SaveAiProviderConfiguration {
  constructor(private readonly context: Context) {}
  async execute(input: Readonly<{principal: StaffPrincipal; expectedVersion: unknown; id: unknown; adapterKey: unknown; displayName: unknown; enabled: unknown; priority: unknown}>): Promise<Readonly<{status: "saved"; provider: ReturnType<typeof toAiProviderConfigurationDto>}> | Failure> {
    if (!this.context.authorization.mayManageAiProviders(input.principal)) return {status: "forbidden"};
    const expected = expectedVersion(input.expectedVersion); if (expected === null) return {status: "validation_failed", field: "expectedVersion"};
    try {
      const previous = await this.context.repository.findProvider(String(input.id));
      if ((previous?.version ?? 0) !== expected) return {status: "conflict"};
      const now = this.context.clock.now(); const actor = this.context.authorization.actorReferenceFor(input.principal);
      const provider = AiProviderConfiguration.create({...input, version: expected + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, updatedBy: actor});
      const failure = mapSaveFailure(await this.context.repository.saveProvider(provider, event(this.context, "PROVIDER", previous, provider, actor, now), expected));
      return failure ?? {status: "saved", provider: toAiProviderConfigurationDto(provider)};
    } catch (error) { return caught(error); }
  }
}

export class SaveAiModelProfile {
  constructor(private readonly context: Context) {}
  async execute(input: Readonly<{principal: StaffPrincipal; expectedVersion: unknown; id: unknown; providerId: unknown; name: unknown; modelIdentifier: unknown; enabled: unknown; priority: unknown; capabilities: unknown; generationSettings: unknown}>): Promise<Readonly<{status: "saved"; profile: ReturnType<typeof toAiModelProfileDto>}> | Failure> {
    if (!this.context.authorization.mayManageAiProviders(input.principal)) return {status: "forbidden"};
    const expected = expectedVersion(input.expectedVersion); if (expected === null) return {status: "validation_failed", field: "expectedVersion"};
    try {
      const previous = await this.context.repository.findProfile(String(input.id));
      if ((previous?.version ?? 0) !== expected || (previous && previous.providerId !== input.providerId)) return {status: "conflict"};
      const now = this.context.clock.now(); const actor = this.context.authorization.actorReferenceFor(input.principal);
      const profile = AiModelProfile.create({...input, version: expected + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, updatedBy: actor});
      const failure = mapSaveFailure(await this.context.repository.saveProfile(profile, event(this.context, "MODEL_PROFILE", previous, profile, actor, now), expected));
      return failure ?? {status: "saved", profile: toAiModelProfileDto(profile)};
    } catch (error) { return caught(error); }
  }
}

export class SaveAiCredentialReference {
  constructor(private readonly context: Context) {}
  async execute(input: Readonly<{principal: StaffPrincipal; expectedVersion: unknown; id: unknown; providerId: unknown; alias: unknown; credentialReference: unknown; enabled: unknown; priority: unknown}>): Promise<Readonly<{status: "saved"; credentialReference: ReturnType<typeof toAiCredentialReferenceDto>}> | Failure> {
    if (!this.context.authorization.mayManageAiCredentialReferences(input.principal)) return {status: "forbidden"};
    const expected = expectedVersion(input.expectedVersion); if (expected === null) return {status: "validation_failed", field: "expectedVersion"};
    try {
      const previous = await this.context.repository.findCredentialReference(String(input.id));
      if ((previous?.version ?? 0) !== expected || (previous && previous.providerId !== input.providerId)) return {status: "conflict"};
      const now = this.context.clock.now(); const actor = this.context.authorization.actorReferenceFor(input.principal);
      const credential = AiCredentialReference.create({...input, version: expected + 1, createdAt: previous?.createdAt ?? now, updatedAt: now, updatedBy: actor});
      const failure = mapSaveFailure(await this.context.repository.saveCredentialReference(credential, event(this.context, "CREDENTIAL_REFERENCE", previous, credential, actor, now), expected));
      return failure ?? {status: "saved", credentialReference: toAiCredentialReferenceDto(credential)};
    } catch (error) { return caught(error); }
  }
}
