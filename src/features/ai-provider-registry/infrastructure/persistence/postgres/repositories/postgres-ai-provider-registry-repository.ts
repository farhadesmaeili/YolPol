import {and, asc, desc, eq} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {AiCredentialReferenceDto, AiModelProfileDto, AiProviderConfigurationDto, AiProviderRegistryEventDto, AiRegistryAuditSnapshot} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import {toAiCredentialReferenceDto, toAiModelProfileDto, toAiProviderConfigurationDto} from "@/features/ai-provider-registry/application/mappers/ai-provider-registry-dto-mapper";
import {InvalidStoredAiProviderRegistryError, type AiProviderRegistryEntity, type AiProviderRegistryEvent, type AiProviderRegistryRepository, type AiProviderRegistrySnapshot, type AiRegistrySaveResult} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";
import {AiCredentialReference} from "@/features/ai-provider-registry/domain/entities/ai-credential-reference";
import {AiModelProfile} from "@/features/ai-provider-registry/domain/entities/ai-model-profile";
import {AiProviderConfiguration} from "@/features/ai-provider-registry/domain/entities/ai-provider-configuration";
import {AiProviderRegistryValidationError} from "@/features/ai-provider-registry/domain/errors/ai-provider-registry-errors";
import {aiCredentialReferences, aiModelProfileCapabilities, aiModelProfiles, aiProviderConfigs, aiProviderRegistryEvents, aiProviderRegistryPostgresSchema} from "@/features/ai-provider-registry/infrastructure/persistence/postgres/schema/ai-provider-registry-schema";

type PgFailure = Readonly<{code?: string; constraint?: string; cause?: unknown}>;
const failureCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const failure = error as PgFailure;
  return failure.code ?? failureCode(failure.cause);
};
const failureConstraint = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const failure = error as PgFailure;
  return failure.constraint ?? failureConstraint(failure.cause);
};
const saveFailure = (error: unknown): AiRegistrySaveResult | null => {
  if (failureCode(error) === "23503") return "missing_parent";
  if (failureCode(error) !== "23505") return null;
  const constraint = failureConstraint(error);
  if (constraint === "ai_provider_registry_events_pkey") return null;
  return constraint?.endsWith("_pkey") ? "conflict" : "duplicate";
};

function snapshot(value: AiProviderRegistryEntity): AiRegistryAuditSnapshot {
  if (value instanceof AiProviderConfiguration) return toAiProviderConfigurationDto(value);
  if (value instanceof AiModelProfile) return toAiModelProfileDto(value);
  return toAiCredentialReferenceDto(value);
}

function assertEvent(event: AiProviderRegistryEvent, value: AiProviderRegistryEntity, expectedVersion: number): void {
  if (event.newEntity !== value || event.entityId !== value.id || event.actorReference !== value.updatedBy || event.occurredAt.getTime() !== value.updatedAt.getTime() || value.version !== expectedVersion + 1 || (event.previousEntity?.version ?? 0) !== expectedVersion) throw new Error("AI provider registry transaction invariant failed.");
}

function eventRow(event: AiProviderRegistryEvent) {
  return {id: event.id, entityType: event.entityType, entityId: event.entityId, changeType: event.changeType, previousVersion: event.previousEntity?.version ?? null, newVersion: event.newEntity.version, actorReference: event.actorReference, previousSnapshot: event.previousEntity ? snapshot(event.previousEntity) : null, newSnapshot: snapshot(event.newEntity), occurredAt: event.occurredAt};
}

function providerFromRow(row: typeof aiProviderConfigs.$inferSelect): AiProviderConfiguration { return AiProviderConfiguration.restore(row); }
function credentialFromRow(row: typeof aiCredentialReferences.$inferSelect): AiCredentialReference { return AiCredentialReference.restore(row); }
function profileFromRow(row: typeof aiModelProfiles.$inferSelect, capabilities: readonly string[]): AiModelProfile {
  return AiModelProfile.restore({...row, capabilities, generationSettings: {temperature: row.temperature, topP: row.topP, maxOutputTokens: row.maxOutputTokens}});
}

function restoreAuditSnapshot(value: AiRegistryAuditSnapshot, entityType: string): AiRegistryAuditSnapshot {
  if (entityType === "PROVIDER") { const item = value as AiProviderConfigurationDto; return toAiProviderConfigurationDto(AiProviderConfiguration.restore({...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt)})); }
  if (entityType === "MODEL_PROFILE") { const item = value as AiModelProfileDto; return toAiModelProfileDto(AiModelProfile.restore({...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt)})); }
  if (entityType === "CREDENTIAL_REFERENCE") { const item = value as AiCredentialReferenceDto; return toAiCredentialReferenceDto(AiCredentialReference.restore({...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt)})); }
  throw new InvalidStoredAiProviderRegistryError();
}

export class PostgresAiProviderRegistryRepository implements AiProviderRegistryRepository {
  private readonly database;
  constructor(pool: Pool) { this.database = drizzle(pool, {schema: aiProviderRegistryPostgresSchema}); }

  async read(): Promise<AiProviderRegistrySnapshot> {
    try {
      const [providers, profileRows, capabilityRows, credentials] = await Promise.all([
        this.database.select().from(aiProviderConfigs).orderBy(asc(aiProviderConfigs.priority), asc(aiProviderConfigs.id)),
        this.database.select().from(aiModelProfiles).orderBy(asc(aiModelProfiles.priority), asc(aiModelProfiles.id)),
        this.database.select().from(aiModelProfileCapabilities).orderBy(asc(aiModelProfileCapabilities.profileId), asc(aiModelProfileCapabilities.capability)),
        this.database.select().from(aiCredentialReferences).orderBy(asc(aiCredentialReferences.priority), asc(aiCredentialReferences.id)),
      ]);
      const capabilities = new Map<string, string[]>();
      for (const row of capabilityRows) capabilities.set(row.profileId, [...(capabilities.get(row.profileId) ?? []), row.capability]);
      return Object.freeze({providers: Object.freeze(providers.map(providerFromRow)), profiles: Object.freeze(profileRows.map((row) => profileFromRow(row, capabilities.get(row.id) ?? []))), credentialReferences: Object.freeze(credentials.map(credentialFromRow))});
    } catch (error) { if (error instanceof AiProviderRegistryValidationError) throw new InvalidStoredAiProviderRegistryError(); throw error; }
  }

  async findProvider(id: string): Promise<AiProviderConfiguration | null> {
    const [row] = await this.database.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.id, id)).limit(1);
    try { return row ? providerFromRow(row) : null; } catch (error) { if (error instanceof AiProviderRegistryValidationError) throw new InvalidStoredAiProviderRegistryError(); throw error; }
  }
  async findProfile(id: string): Promise<AiModelProfile | null> {
    const [row] = await this.database.select().from(aiModelProfiles).where(eq(aiModelProfiles.id, id)).limit(1); if (!row) return null;
    const capabilities = await this.database.select().from(aiModelProfileCapabilities).where(eq(aiModelProfileCapabilities.profileId, id)).orderBy(asc(aiModelProfileCapabilities.capability));
    try { return profileFromRow(row, capabilities.map((item) => item.capability)); } catch (error) { if (error instanceof AiProviderRegistryValidationError) throw new InvalidStoredAiProviderRegistryError(); throw error; }
  }
  async findCredentialReference(id: string): Promise<AiCredentialReference | null> {
    const [row] = await this.database.select().from(aiCredentialReferences).where(eq(aiCredentialReferences.id, id)).limit(1);
    try { return row ? credentialFromRow(row) : null; } catch (error) { if (error instanceof AiProviderRegistryValidationError) throw new InvalidStoredAiProviderRegistryError(); throw error; }
  }

  async saveProvider(value: AiProviderConfiguration, event: AiProviderRegistryEvent, expectedVersion: number): Promise<AiRegistrySaveResult> {
    assertEvent(event, value, expectedVersion);
    try { return await this.database.transaction(async (tx) => {
      const stored = expectedVersion === 0
        ? await tx.insert(aiProviderConfigs).values(value).returning({id: aiProviderConfigs.id})
        : await tx.update(aiProviderConfigs).set({adapterKey: value.adapterKey, displayName: value.displayName, enabled: value.enabled, priority: value.priority, version: value.version, updatedAt: value.updatedAt, updatedBy: value.updatedBy}).where(and(eq(aiProviderConfigs.id, value.id), eq(aiProviderConfigs.version, expectedVersion))).returning({id: aiProviderConfigs.id});
      if (stored.length !== 1) return "conflict" as const;
      await tx.insert(aiProviderRegistryEvents).values(eventRow(event)); return "saved" as const;
    }); } catch (error) { const mapped = saveFailure(error); if (mapped) return mapped; throw error; }
  }

  async saveProfile(value: AiModelProfile, event: AiProviderRegistryEvent, expectedVersion: number): Promise<AiRegistrySaveResult> {
    assertEvent(event, value, expectedVersion);
    const row = {id: value.id, providerId: value.providerId, name: value.name, modelIdentifier: value.modelIdentifier, enabled: value.enabled, priority: value.priority, temperature: value.generationSettings.temperature, topP: value.generationSettings.topP, maxOutputTokens: value.generationSettings.maxOutputTokens, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt, updatedBy: value.updatedBy};
    try { return await this.database.transaction(async (tx) => {
      const stored = expectedVersion === 0 ? await tx.insert(aiModelProfiles).values(row).returning({id: aiModelProfiles.id}) : await tx.update(aiModelProfiles).set({...row, id: undefined, providerId: undefined, createdAt: undefined}).where(and(eq(aiModelProfiles.id, value.id), eq(aiModelProfiles.version, expectedVersion))).returning({id: aiModelProfiles.id});
      if (stored.length !== 1) return "conflict" as const;
      await tx.delete(aiModelProfileCapabilities).where(eq(aiModelProfileCapabilities.profileId, value.id));
      await tx.insert(aiModelProfileCapabilities).values(value.capabilities.map((capability) => ({profileId: value.id, capability})));
      await tx.insert(aiProviderRegistryEvents).values(eventRow(event)); return "saved" as const;
    }); } catch (error) { const mapped = saveFailure(error); if (mapped) return mapped; throw error; }
  }

  async saveCredentialReference(value: AiCredentialReference, event: AiProviderRegistryEvent, expectedVersion: number): Promise<AiRegistrySaveResult> {
    assertEvent(event, value, expectedVersion);
    try { return await this.database.transaction(async (tx) => {
      const stored = expectedVersion === 0
        ? await tx.insert(aiCredentialReferences).values(value).returning({id: aiCredentialReferences.id})
        : await tx.update(aiCredentialReferences).set({alias: value.alias, credentialReference: value.credentialReference, enabled: value.enabled, priority: value.priority, version: value.version, updatedAt: value.updatedAt, updatedBy: value.updatedBy}).where(and(eq(aiCredentialReferences.id, value.id), eq(aiCredentialReferences.version, expectedVersion))).returning({id: aiCredentialReferences.id});
      if (stored.length !== 1) return "conflict" as const;
      await tx.insert(aiProviderRegistryEvents).values(eventRow(event)); return "saved" as const;
    }); } catch (error) { const mapped = saveFailure(error); if (mapped) return mapped; throw error; }
  }

  async readEvents(limit: number): Promise<readonly AiProviderRegistryEventDto[]> {
    const rows = await this.database.select().from(aiProviderRegistryEvents).orderBy(desc(aiProviderRegistryEvents.occurredAt), desc(aiProviderRegistryEvents.id)).limit(limit);
    try { return Object.freeze(rows.map((row) => {
      const previous = row.previousSnapshot ? restoreAuditSnapshot(row.previousSnapshot, row.entityType) : null;
      const next = restoreAuditSnapshot(row.newSnapshot, row.entityType);
      if (next.id !== row.entityId || next.version !== row.newVersion || (previous?.version ?? null) !== row.previousVersion || next.updatedBy !== row.actorReference || next.updatedAt !== row.occurredAt.toISOString()) throw new InvalidStoredAiProviderRegistryError();
      return Object.freeze({...row, entityType: row.entityType as AiProviderRegistryEventDto["entityType"], changeType: row.changeType as AiProviderRegistryEventDto["changeType"], occurredAt: row.occurredAt.toISOString(), previousSnapshot: previous, newSnapshot: next});
    })); } catch (error) { if (error instanceof AiProviderRegistryValidationError || error instanceof InvalidStoredAiProviderRegistryError) throw new InvalidStoredAiProviderRegistryError(); throw error; }
  }
}
