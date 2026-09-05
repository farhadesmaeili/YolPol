import {describe, expect, it} from "vitest";
import {GetAiProviderRegistry} from "@/features/ai-provider-registry/application/use-cases/get-ai-provider-registry";
import {GetEligibleAiModelProfiles} from "@/features/ai-provider-registry/application/use-cases/get-eligible-ai-model-profiles";
import {SaveAiCredentialReference, SaveAiModelProfile, SaveAiProviderConfiguration} from "@/features/ai-provider-registry/application/use-cases/save-ai-provider-registry-entities";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {FakeAiProviderRegistryClock, FakeAiProviderRegistryEventIdGenerator, FakeAiProviderRegistryRepository} from "@/features/ai-provider-registry/testing/fakes/ai-provider-registry-fakes";

const authorization = new StaffAuthorizationPolicy(); const principal = (role: StaffRole) => ({staffAccountId: "account-1", teamMemberId: "member-1", role, displayName: "Staff", actorReference: "staff:member-1"});
const context = (repository: FakeAiProviderRegistryRepository) => ({repository, authorization, clock: new FakeAiProviderRegistryClock(), eventIds: new FakeAiProviderRegistryEventIdGenerator()});
const providerInput = (role: StaffRole = "ADMIN") => ({principal: principal(role), expectedVersion: 0, id: "provider-a", adapterKey: "groq", displayName: "Provider A", enabled: true, priority: 10});
const profileInput = (role: StaffRole = "ADMIN") => ({principal: principal(role), expectedVersion: 0, id: "profile-a", providerId: "provider-a", name: "Fast", modelIdentifier: "model-fast", enabled: true, priority: 10, capabilities: ["TEXT_GENERATION"], generationSettings: {temperature: null, topP: null, maxOutputTokens: 2048}});
const credentialInput = (role: StaffRole = "SUPER_ADMIN") => ({principal: principal(role), expectedVersion: 0, id: "credential-a", providerId: "provider-a", alias: "Primary", credentialReference: "groq-primary", enabled: true, priority: 10});

async function eligibleProfiles(options: Readonly<{providerEnabled?: boolean; profileEnabled?: boolean; capabilities?: readonly string[]; credentialEnabled?: boolean}> = {}) {
  const repository = new FakeAiProviderRegistryRepository(); const value = context(repository);
  await new SaveAiProviderConfiguration(value).execute({...providerInput(), enabled: options.providerEnabled ?? true});
  await new SaveAiModelProfile(value).execute({...profileInput(), enabled: options.profileEnabled ?? true, capabilities: options.capabilities ?? ["TEXT_GENERATION"]});
  await new SaveAiCredentialReference(value).execute({...credentialInput(), enabled: options.credentialEnabled ?? true});
  return new GetEligibleAiModelProfiles(repository).execute("TEXT_GENERATION");
}

describe("AI provider registry use cases", () => {
  it("excludes a TEXT_GENERATION-only profile from TRANSLATION eligibility", async () => {
    const repository = new FakeAiProviderRegistryRepository(); const value = context(repository);
    await new SaveAiProviderConfiguration(value).execute(providerInput());
    await new SaveAiCredentialReference(value).execute(credentialInput());
    const save = new SaveAiModelProfile(value);
    await save.execute(profileInput());
    const eligibility = new GetEligibleAiModelProfiles(repository);
    expect(await eligibility.execute("TRANSLATION")).toEqual([]);
    await save.execute({...profileInput(), expectedVersion: 1, capabilities: ["TEXT_GENERATION", "TRANSLATION"]});
    expect((await eligibility.execute("TRANSLATION")).map(({profile}) => profile.id)).toEqual(["profile-a"]);
  });
  it("creates and updates all entities with server-derived actors, versions, and audit intents", async () => { const repository = new FakeAiProviderRegistryRepository(); const value = context(repository); const saveProvider = new SaveAiProviderConfiguration(value); expect(await saveProvider.execute({...providerInput(), principal: {...principal("ADMIN"), displayName: "browser label"}})).toMatchObject({status: "saved", provider: {version: 1, updatedBy: "staff:member-1"}}); expect(await new SaveAiModelProfile(value).execute(profileInput())).toMatchObject({status: "saved", profile: {version: 1}}); expect(await new SaveAiCredentialReference(value).execute(credentialInput())).toMatchObject({status: "saved", credentialReference: {version: 1}}); expect(repository.events.map((event) => event.entityType)).toEqual(["PROVIDER", "MODEL_PROFILE", "CREDENTIAL_REFERENCE"]); value.clock.instant = new Date("2026-09-01T13:00:00Z"); expect(await saveProvider.execute({...providerInput(), expectedVersion: 1, enabled: false})).toMatchObject({status: "saved", provider: {version: 2, enabled: false}}); expect(repository.events.at(-1)?.changeType).toBe("DISABLED"); });
  it("enforces Super Admin credential management and Admin provider/profile management centrally", async () => { const repository = new FakeAiProviderRegistryRepository(); const value = context(repository); await expect(new SaveAiProviderConfiguration(value).execute(providerInput("SALES"))).resolves.toEqual({status: "forbidden"}); await new SaveAiProviderConfiguration(value).execute(providerInput("ADMIN")); await expect(new SaveAiCredentialReference(value).execute(credentialInput("ADMIN"))).resolves.toEqual({status: "forbidden"}); await expect(new SaveAiCredentialReference(value).execute(credentialInput("SUPER_ADMIN"))).resolves.toMatchObject({status: "saved"}); });
  it("allows every current Staff role to read safe registry data", async () => { const repository = new FakeAiProviderRegistryRepository(); for (const role of ["SUPER_ADMIN", "ADMIN", "SALES", "VIEWER"] as const) await expect(new GetAiProviderRegistry(repository, authorization).execute(principal(role))).resolves.toMatchObject({status: "found"}); });
  it("rejects stale writes and parent changes", async () => { const repository = new FakeAiProviderRegistryRepository(); const value = context(repository); const save = new SaveAiProviderConfiguration(value); await save.execute(providerInput()); await expect(save.execute(providerInput())).resolves.toEqual({status: "conflict"}); });
  it("requires an enabled Provider, enabled Profile, required capability, and enabled credential", async () => {
    expect((await eligibleProfiles()).map((item) => item.profile.id)).toEqual(["profile-a"]);
    expect(await eligibleProfiles({providerEnabled: false})).toEqual([]);
    expect(await eligibleProfiles({profileEnabled: false})).toEqual([]);
    expect(await eligibleProfiles({capabilities: ["TRANSLATION"]})).toEqual([]);
    expect(await eligibleProfiles({credentialEnabled: false})).toEqual([]);
  });
  it("orders multiple eligible candidates by Provider priority and ID, then Profile priority and ID, independent of insertion order", async () => {
    const repository = new FakeAiProviderRegistryRepository(); const value = context(repository); const saveProvider = new SaveAiProviderConfiguration(value); const saveProfile = new SaveAiModelProfile(value); const saveCredential = new SaveAiCredentialReference(value);
    for (const item of [{id: "provider-z", priority: 10}, {id: "provider-a", priority: 10}, {id: "provider-low", priority: 5}]) await saveProvider.execute({...providerInput(), ...item, displayName: item.id});
    for (const item of [{id: "middle-profile", providerId: "provider-z"}, {id: "z-profile", providerId: "provider-a"}, {id: "low-profile", providerId: "provider-low"}, {id: "a-profile", providerId: "provider-a"}]) await saveProfile.execute({...profileInput(), ...item, name: item.id, modelIdentifier: `model/${item.id}`});
    for (const item of [{id: "credential-z", providerId: "provider-z"}, {id: "credential-a", providerId: "provider-a"}, {id: "credential-low", providerId: "provider-low"}]) await saveCredential.execute({...credentialInput(), ...item, alias: item.id, credentialReference: `${item.providerId}-${item.id}`});
    const result = await new GetEligibleAiModelProfiles(repository).execute("TEXT_GENERATION");
    expect(result.map((item) => `${item.provider.id}/${item.profile.id}`)).toEqual(["provider-low/low-profile", "provider-a/a-profile", "provider-a/z-profile", "provider-z/middle-profile"]);
  });
  it("classifies Provider, Profile, and Credential Reference enable and disable transitions", async () => {
    const repository = new FakeAiProviderRegistryRepository(); const value = context(repository); const saveProvider = new SaveAiProviderConfiguration(value); const saveProfile = new SaveAiModelProfile(value); const saveCredential = new SaveAiCredentialReference(value);
    await saveProvider.execute(providerInput()); await saveProfile.execute(profileInput()); await saveCredential.execute(credentialInput());
    value.clock.instant = new Date("2026-09-01T13:00:00Z");
    await saveProvider.execute({...providerInput(), expectedVersion: 1, enabled: false}); await saveProfile.execute({...profileInput(), expectedVersion: 1, enabled: false}); await saveCredential.execute({...credentialInput(), expectedVersion: 1, enabled: false});
    value.clock.instant = new Date("2026-09-01T14:00:00Z");
    await saveProvider.execute({...providerInput(), expectedVersion: 2}); await saveProfile.execute({...profileInput(), expectedVersion: 2}); await saveCredential.execute({...credentialInput(), expectedVersion: 2});
    expect(repository.events.slice(3, 6).map(({entityType, changeType}) => [entityType, changeType])).toEqual([["PROVIDER", "DISABLED"], ["MODEL_PROFILE", "DISABLED"], ["CREDENTIAL_REFERENCE", "DISABLED"]]);
    expect(repository.events.slice(6, 9).map(({entityType, changeType}) => [entityType, changeType])).toEqual([["PROVIDER", "ENABLED"], ["MODEL_PROFILE", "ENABLED"], ["CREDENTIAL_REFERENCE", "ENABLED"]]);
  });
});
