import {describe, expect, it} from "vitest";

import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {ConsumeTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/consume-telegram-connection-request";
import {CreateOwnTelegramConnectionRequest, telegramConnectionRequestLifetimeMs} from "@/features/telegram-staff-onboarding/application/use-cases/create-own-telegram-connection-request";
import {DisconnectOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/disconnect-own-telegram";
import {ForceDisconnectStaffTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/force-disconnect-staff-telegram";
import {GetOwnTelegramConnection} from "@/features/telegram-staff-onboarding/application/use-cases/get-own-telegram-connection";
import {GetStaffTelegramConnection} from "@/features/telegram-staff-onboarding/application/use-cases/get-staff-telegram-connection";
import {ResolveTelegramStaffActor} from "@/features/telegram-staff-onboarding/application/use-cases/resolve-telegram-staff-actor";
import {RevokeOwnTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-own-telegram-connection-request";
import {RevokeStaffTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-staff-telegram-connection-request";
import {FakeTelegramConnectionTokenService, FakeTelegramStaffOnboardingRepository, telegramIdentity, telegramPrincipal, telegramTestNow} from "@/features/telegram-staff-onboarding/testing/fakes/telegram-staff-onboarding-fakes";

const authorization = new StaffAuthorizationPolicy();
const tokens = new FakeTelegramConnectionTokenService();
const clock = {now: () => telegramTestNow};
const ids = {linkId: () => "telegram-link-1"};

function setup(role: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER" = "SALES") {
  const owner = telegramIdentity(role, "owner");
  const repository = new FakeTelegramStaffOnboardingRepository().addIdentity(owner);
  return {
    owner,
    principal: telegramPrincipal(owner),
    repository,
    create: new CreateOwnTelegramConnectionRequest(repository, tokens, authorization, clock),
    consume: new ConsumeTelegramConnectionRequest(repository, tokens, ids, authorization),
  };
}

describe("Telegram Staff onboarding application", () => {
  it("creates a 10-minute request only for the current principal and revokes the previous request", async () => {
    const {owner, principal, repository, create} = setup();
    const first = await create.execute({principal});
    const second = await create.execute({principal, targetStaffAccountId: "account-other"} as {principal: typeof principal});
    expect(first).toEqual({status: "created", connectionToken: tokens.credential, expiresAt: new Date(telegramTestNow.getTime() + telegramConnectionRequestLifetimeMs).toISOString()});
    expect(second.status).toBe("created");
    expect(repository.requests).toHaveLength(2);
    expect(repository.requests[0]?.revoked).toBe(true);
    expect(repository.requests[1]?.request.staffAccountId).toBe(owner.staffAccountId);
    expect(repository.requests[1]?.request.teamMemberId).toBe(owner.teamMemberId);
    expect(repository.requests[1]?.request).not.toHaveProperty("credential");
  });

  it.each([
    {overrides: {accountActive: false}, label: "inactive Staff Account"},
    {overrides: {teamMemberActive: false}, label: "inactive Team Member"},
  ] as const)("denies request creation for $label", async ({overrides}) => {
    const owner = telegramIdentity("SALES", "owner", overrides);
    const repository = new FakeTelegramStaffOnboardingRepository().addIdentity(owner);
    const useCase = new CreateOwnTelegramConnectionRequest(repository, tokens, authorization, clock);
    await expect(useCase.execute({principal: telegramPrincipal(owner)})).resolves.toEqual({status: "unavailable"});
    expect(repository.requests).toHaveLength(0);
  });

  it("consumes once, rejects replay/revocation/expiry, and uses current activation", async () => {
    const successful = setup();
    await successful.create.execute({principal: successful.principal});
    const proof = {connectionToken: tokens.credential, telegramUserId: "9007199254740993", privateChatId: "7000000000000001"};
    await expect(successful.consume.execute(proof)).resolves.toEqual({status: "connected"});
    await expect(successful.consume.execute(proof)).resolves.toEqual({status: "unavailable"});

    const revoked = setup();
    await revoked.create.execute({principal: revoked.principal});
    await new RevokeOwnTelegramConnectionRequest(revoked.repository, authorization).execute({principal: revoked.principal});
    await expect(revoked.consume.execute(proof)).resolves.toEqual({status: "unavailable"});

    const expired = setup();
    await expired.create.execute({principal: expired.principal});
    expired.repository.now = new Date(telegramTestNow.getTime() + telegramConnectionRequestLifetimeMs);
    await expect(expired.consume.execute(proof)).resolves.toEqual({status: "unavailable"});

    const inactive = setup();
    await inactive.create.execute({principal: inactive.principal});
    inactive.repository.identities.set(inactive.owner.staffAccountId, {...inactive.owner, accountActive: false});
    await expect(inactive.consume.execute(proof)).resolves.toEqual({status: "unavailable"});
  });

  it("allows role changes before consumption while retaining current dynamic policy", async () => {
    const scenario = setup("SALES");
    await scenario.create.execute({principal: scenario.principal});
    scenario.repository.identities.set(scenario.owner.staffAccountId, {...scenario.owner, role: "VIEWER"});
    await expect(scenario.consume.execute({connectionToken: tokens.credential, telegramUserId: "101", privateChatId: "201"})).resolves.toEqual({status: "connected"});
  });

  it("enforces active, cross-Staff, and historical ownership conflicts", async () => {
    const scenario = setup();
    await scenario.create.execute({principal: scenario.principal});
    await scenario.consume.execute({connectionToken: tokens.credential, telegramUserId: "101", privateChatId: "201"});

    await scenario.create.execute({principal: scenario.principal});
    await expect(scenario.consume.execute({connectionToken: tokens.credential, telegramUserId: "102", privateChatId: "202"})).resolves.toEqual({status: "unavailable"});

    const other = telegramIdentity("SALES", "other");
    scenario.repository.addIdentity(other);
    const otherCreate = new CreateOwnTelegramConnectionRequest(scenario.repository, tokens, authorization, clock);
    const otherConsume = new ConsumeTelegramConnectionRequest(scenario.repository, tokens, {linkId: () => "telegram-link-2"}, authorization);
    await otherCreate.execute({principal: telegramPrincipal(other)});
    await expect(otherConsume.execute({connectionToken: tokens.credential, telegramUserId: "101", privateChatId: "301"})).resolves.toEqual({status: "unavailable"});

    scenario.repository.activeUsersByTeamMember.delete(scenario.owner.teamMemberId);
    await expect(otherConsume.execute({connectionToken: tokens.credential, telegramUserId: "101", privateChatId: "301"})).resolves.toEqual({status: "unavailable"});
  });

  it("supports self disconnect, same-identity reconnect, and a new never-owned identity", async () => {
    const scenario = setup();
    await scenario.create.execute({principal: scenario.principal});
    await scenario.consume.execute({connectionToken: tokens.credential, telegramUserId: "101", privateChatId: "201"});
    const disconnect = new DisconnectOwnTelegram(scenario.repository, authorization);
    await expect(disconnect.execute({principal: scenario.principal})).resolves.toEqual({status: "disconnected"});

    await scenario.create.execute({principal: scenario.principal});
    await expect(scenario.consume.execute({connectionToken: tokens.credential, telegramUserId: "101", privateChatId: "202"})).resolves.toEqual({status: "connected"});
    await disconnect.execute({principal: scenario.principal});
    await scenario.create.execute({principal: scenario.principal});
    await expect(scenario.consume.execute({connectionToken: tokens.credential, telegramUserId: "102", privateChatId: "203"})).resolves.toEqual({status: "connected"});
  });

  it("returns safe own connection state without Telegram identifiers", async () => {
    const scenario = setup();
    const get = new GetOwnTelegramConnection(scenario.repository, authorization);
    await expect(get.execute({principal: scenario.principal})).resolves.toEqual({status: "not_connected"});
    await scenario.create.execute({principal: scenario.principal});
    const pending = await get.execute({principal: scenario.principal});
    expect(pending).toEqual({status: "pending", expiresAt: new Date(telegramTestNow.getTime() + telegramConnectionRequestLifetimeMs).toISOString()});
    expect(JSON.stringify(pending)).not.toMatch(/telegramUser|chatId|token/iu);
  });

  it.each([
    ["VIEWER", false],
    ["SALES", true],
    ["ADMIN", true],
    ["SUPER_ADMIN", true],
  ] as const)("resolves current %s identity with current reply capability", async (role, mayReply) => {
    const scenario = setup(role);
    scenario.repository.activeUsersByTeamMember.set(scenario.owner.teamMemberId, "101");
    const result = await new ResolveTelegramStaffActor(scenario.repository, authorization).execute({telegramUserId: "101"});
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.actor.capabilities.mayReplyToCustomerConversation).toBe(mayReply);
  });

  it("denies inactive and disconnected actor resolution", async () => {
    const scenario = setup();
    const resolve = new ResolveTelegramStaffActor(scenario.repository, authorization);
    scenario.repository.activeUsersByTeamMember.set(scenario.owner.teamMemberId, "101");
    scenario.repository.identities.set(scenario.owner.staffAccountId, {...scenario.owner, teamMemberActive: false});
    await expect(resolve.execute({telegramUserId: "101"})).resolves.toEqual({status: "unresolved"});
    scenario.repository.identities.set(scenario.owner.staffAccountId, scenario.owner);
    scenario.repository.activeUsersByTeamMember.clear();
    await expect(resolve.execute({telegramUserId: "101"})).resolves.toEqual({status: "unresolved"});
  });
});

describe("Telegram Staff manager authorization", () => {
  function managerScenario(actorRole: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER", targetRole: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER") {
    const actor = telegramIdentity(actorRole, "actor");
    const target = telegramIdentity(targetRole, "target");
    const repository = new FakeTelegramStaffOnboardingRepository().addIdentity(actor).addIdentity(target);
    repository.activeUsersByTeamMember.set(target.teamMemberId, "101");
    return {actor, target, repository, principal: telegramPrincipal(actor)};
  }

  it.each([
    ["SUPER_ADMIN", "ADMIN", "disconnected"],
    ["SUPER_ADMIN", "SALES", "disconnected"],
    ["ADMIN", "SALES", "disconnected"],
    ["ADMIN", "VIEWER", "disconnected"],
    ["ADMIN", "ADMIN", "unavailable"],
    ["ADMIN", "SUPER_ADMIN", "unavailable"],
    ["SALES", "VIEWER", "unavailable"],
    ["VIEWER", "SALES", "unavailable"],
  ] as const)("%s force-disconnect targeting %s returns %s", async (actorRole, targetRole, expected) => {
    const scenario = managerScenario(actorRole, targetRole);
    const result = await new ForceDisconnectStaffTelegram(scenario.repository, authorization).execute({principal: scenario.principal, targetStaffAccountId: scenario.target.staffAccountId});
    expect(result).toEqual({status: expected});
  });

  it.each([
    ["SUPER_ADMIN", "ADMIN", "revoked"],
    ["ADMIN", "SALES", "revoked"],
    ["ADMIN", "VIEWER", "revoked"],
    ["ADMIN", "ADMIN", "unavailable"],
    ["ADMIN", "SUPER_ADMIN", "unavailable"],
    ["SALES", "VIEWER", "unavailable"],
    ["VIEWER", "SALES", "unavailable"],
  ] as const)("%s request revocation targeting %s returns %s", async (actorRole, targetRole, expected) => {
    const scenario = managerScenario(actorRole, targetRole);
    const create = new CreateOwnTelegramConnectionRequest(scenario.repository, tokens, authorization, clock);
    await create.execute({principal: telegramPrincipal(scenario.target)});
    const result = await new RevokeStaffTelegramConnectionRequest(scenario.repository, authorization).execute({principal: scenario.principal, targetStaffAccountId: scenario.target.staffAccountId});
    expect(result).toEqual({status: expected});
  });

  it("does not let any manager create a request on a target's behalf", async () => {
    for (const role of ["SUPER_ADMIN", "ADMIN"] as const) {
      const scenario = managerScenario(role, "SALES");
      const create = new CreateOwnTelegramConnectionRequest(scenario.repository, tokens, authorization, clock);
      await create.execute({principal: scenario.principal, targetStaffAccountId: scenario.target.staffAccountId} as {principal: typeof scenario.principal});
      expect(scenario.repository.requests[0]?.request.staffAccountId).toBe(scenario.actor.staffAccountId);
    }
  });

  it("provides authorized identifier-free Team Management status foundation", async () => {
    const permitted = managerScenario("ADMIN", "SALES");
    const status = await new GetStaffTelegramConnection(permitted.repository, authorization).execute({
      principal: permitted.principal,
      targetStaffAccountId: permitted.target.staffAccountId,
    });
    expect(status).toEqual({status: "connected"});
    expect(JSON.stringify(status)).not.toMatch(/telegramUser|chatId|token/iu);

    const hidden = managerScenario("ADMIN", "ADMIN");
    await expect(new GetStaffTelegramConnection(hidden.repository, authorization).execute({
      principal: hidden.principal,
      targetStaffAccountId: hidden.target.staffAccountId,
    })).resolves.toEqual({status: "unavailable"});
    expect(hidden.repository.stateReads).toBe(0);
  });

  it("authorizes before state reads and keeps unauthorized state/no-op results neutral", async () => {
    for (const state of ["connected", "disconnected", "pending", "empty"] as const) {
      const scenario = managerScenario("ADMIN", "ADMIN");
      if (state !== "connected") scenario.repository.activeUsersByTeamMember.clear();
      if (state === "pending") {
        await new CreateOwnTelegramConnectionRequest(scenario.repository, tokens, authorization, clock).execute({principal: telegramPrincipal(scenario.target)});
      }
      const disconnectResult = await new ForceDisconnectStaffTelegram(scenario.repository, authorization).execute({principal: scenario.principal, targetStaffAccountId: scenario.target.staffAccountId});
      const revokeResult = await new RevokeStaffTelegramConnectionRequest(scenario.repository, authorization).execute({principal: scenario.principal, targetStaffAccountId: scenario.target.staffAccountId});
      expect(disconnectResult).toEqual({status: "unavailable"});
      expect(revokeResult).toEqual({status: "unavailable"});
      expect(scenario.repository.authorizationChecks).toBe(2);
      expect(scenario.repository.stateReads).toBe(0);
    }
  });
});
