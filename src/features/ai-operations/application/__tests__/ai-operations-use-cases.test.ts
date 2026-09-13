import {describe, expect, it} from "vitest";

import {InvalidStoredAiOperationsPolicyError} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {EvaluateAiOperationsAvailability} from "@/features/ai-operations/application/use-cases/evaluate-ai-operations-availability";
import {GetAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/get-ai-operations-policy";
import {ReadAiOperationsAuditHistory} from "@/features/ai-operations/application/use-cases/read-ai-operations-audit-history";
import {UpdateAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/update-ai-operations-policy";
import {PlanAiOperationsFallback} from "@/features/ai-operations/application/use-cases/plan-ai-operations-fallback";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {FakeAiOperationsClock, FakeAiOperationsEmergencyOverride, FakeAiOperationsEventIdGenerator, FakeAiOperationsRepository} from "@/features/ai-operations/testing/fakes/ai-operations-fakes";

const authorization = new StaffAuthorizationPolicy();
const principal = (role: StaffRole) => ({staffAccountId: "account-1", teamMemberId: "member-1", role, displayName: "Staff", actorReference: "staff:member-1"});
const updateInput = (role: StaffRole = "ADMIN") => ({
  principal: principal(role), expectedVersion: 0, mode: "SCHEDULED", businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900,
  scheduleWindows: [{weekday: "MONDAY", startMinute: 1_200, endMinute: 480, enabled: true}],
});

describe("AI Operations use cases", () => {
  it("creates version one with a server-derived actor and one atomic event intent", async () => {
    const repository = new FakeAiOperationsRepository();
    const useCase = new UpdateAiOperationsPolicy(repository, authorization, new FakeAiOperationsClock(), new FakeAiOperationsEventIdGenerator());
    const result = await useCase.execute({...updateInput(), principal: {...principal("ADMIN"), displayName: "Changed client label"}});
    expect(result).toMatchObject({status: "updated", policy: {version: 1, updatedBy: "staff:member-1"}});
    expect(repository.policy?.scheduleWindows).toEqual([
      {weekday: "MONDAY", startMinute: 1_200, endMinute: 1_440, enabled: true},
      {weekday: "TUESDAY", startMinute: 0, endMinute: 480, enabled: true},
    ]);
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({eventType: "POLICY_CREATED", actorReference: "staff:member-1", previousPolicy: null});
  });

  it("enforces role permissions before validation or persistence", async () => {
    const repository = new FakeAiOperationsRepository();
    const useCase = new UpdateAiOperationsPolicy(repository, authorization, new FakeAiOperationsClock(), new FakeAiOperationsEventIdGenerator());
    await expect(useCase.execute({...updateInput("SALES"), expectedVersion: "forged"})).resolves.toEqual({status: "forbidden"});
    expect(repository.policy).toBeNull();
    await expect(useCase.execute(updateInput("VIEWER"))).resolves.toEqual({status: "forbidden"});
  });

  it.each(["SALES", "VIEWER"] as const)("prevents %s Staff from disabling or re-enabling AI automation", async (role) => {
    const repository = new FakeAiOperationsRepository();
    const useCase = new UpdateAiOperationsPolicy(repository, authorization, new FakeAiOperationsClock(), new FakeAiOperationsEventIdGenerator());
    for (const mode of ["DISABLED", "FALLBACK"] as const) {
      await expect(useCase.execute({...updateInput(role), mode, scheduleWindows: []})).resolves.toEqual({status: "forbidden"});
    }
    expect(repository.policy).toBeNull();
  });

  it("rejects stale versions and reports a transaction-time compare-and-swap conflict", async () => {
    const repository = new FakeAiOperationsRepository();
    const useCase = new UpdateAiOperationsPolicy(repository, authorization, new FakeAiOperationsClock(), new FakeAiOperationsEventIdGenerator());
    await useCase.execute(updateInput());
    await expect(useCase.execute(updateInput())).resolves.toEqual({status: "conflict"});
    repository.saveResult = "conflict";
    await expect(useCase.execute({...updateInput(), expectedVersion: 1})).resolves.toEqual({status: "conflict"});
    expect(repository.events).toHaveLength(1);
  });

  it("fails closed for missing, invalid, unavailable, and emergency-disabled policy state", async () => {
    const repository = new FakeAiOperationsRepository();
    const emergency = new FakeAiOperationsEmergencyOverride();
    const evaluate = new EvaluateAiOperationsAvailability(repository, emergency, new FakeAiOperationsClock());
    await expect(evaluate.execute()).resolves.toEqual({allowed: false, reason: "POLICY_UNAVAILABLE"});
    repository.findError = new InvalidStoredAiOperationsPolicyError();
    await expect(evaluate.execute()).resolves.toEqual({allowed: false, reason: "POLICY_INVALID"});
    repository.findError = new Error("database unavailable");
    await expect(evaluate.execute()).resolves.toEqual({allowed: false, reason: "POLICY_UNAVAILABLE"});
    emergency.value = {active: true, state: "ACTIVE"};
    await expect(evaluate.execute()).resolves.toEqual({allowed: false, reason: "EMERGENCY_DISABLED"});
  });

  it("allows fallback only from persisted policy and proves the emergency override cannot force on", async () => {
    const repository = new FakeAiOperationsRepository();
    await new UpdateAiOperationsPolicy(repository, authorization, new FakeAiOperationsClock(), new FakeAiOperationsEventIdGenerator()).execute({...updateInput(), mode: "FALLBACK", scheduleWindows: []});
    const emergency = new FakeAiOperationsEmergencyOverride({active: false, state: "INACTIVE"});
    const evaluate = new EvaluateAiOperationsAvailability(repository, emergency, new FakeAiOperationsClock());
    await expect(evaluate.execute()).resolves.toEqual({allowed: true, reason: "ALLOWED_FALLBACK"});
    emergency.value = {active: true, state: "INVALID"};
    await expect(evaluate.execute()).resolves.toEqual({allowed: false, reason: "EMERGENCY_DISABLED"});
  });

  it("lets authorized Staff disable and re-enable through the audited versioned policy", async () => {
    const repository = new FakeAiOperationsRepository();
    const clock = new FakeAiOperationsClock();
    const update = new UpdateAiOperationsPolicy(repository, authorization, clock, new FakeAiOperationsEventIdGenerator());
    const evaluate = new EvaluateAiOperationsAvailability(repository, new FakeAiOperationsEmergencyOverride(), clock);

    await expect(update.execute({...updateInput("ADMIN"), mode: "FALLBACK", scheduleWindows: []})).resolves.toMatchObject({status: "updated", policy: {mode: "FALLBACK", version: 1}});
    await expect(evaluate.execute()).resolves.toEqual({allowed: true, reason: "ALLOWED_FALLBACK"});
    await expect(update.execute({...updateInput("SUPER_ADMIN"), expectedVersion: 1, mode: "DISABLED", scheduleWindows: []})).resolves.toMatchObject({status: "updated", policy: {mode: "DISABLED", version: 2}});
    await expect(evaluate.execute()).resolves.toEqual({allowed: false, reason: "POLICY_DISABLED"});
    await expect(update.execute({...updateInput("ADMIN"), expectedVersion: 2, mode: "FALLBACK", scheduleWindows: []})).resolves.toMatchObject({status: "updated", policy: {mode: "FALLBACK", version: 3}});
    await expect(evaluate.execute()).resolves.toEqual({allowed: true, reason: "ALLOWED_FALLBACK"});
    expect(repository.events.map((event) => [event.eventType, event.previousPolicy?.version ?? null, event.newPolicy.version, event.actorReference])).toEqual([
      ["POLICY_CREATED", null, 1, "staff:member-1"],
      ["POLICY_UPDATED", 1, 2, "staff:member-1"],
      ["POLICY_UPDATED", 2, 3, "staff:member-1"],
    ]);
  });

  it("plans grace deadlines and scheduled windows while suppressing disabled and emergency states", async () => {
    const repository = new FakeAiOperationsRepository();
    const emergency = new FakeAiOperationsEmergencyOverride({active: false, state: "INACTIVE"});
    const update = new UpdateAiOperationsPolicy(repository, authorization, new FakeAiOperationsClock(), new FakeAiOperationsEventIdGenerator());
    await update.execute({...updateInput(), mode: "FALLBACK", humanGracePeriodSeconds: 900, scheduleWindows: []});
    const planner = new PlanAiOperationsFallback(repository, emergency);
    await expect(planner.execute({triggeredAt: new Date("2026-09-07T05:00:00.000Z")})).resolves.toEqual({
      status: "scheduled",
      notBefore: new Date("2026-09-07T05:15:00.000Z"),
      continuationNotBefore: new Date("2026-09-07T05:00:00.000Z"),
    });
    await update.execute({...updateInput(), expectedVersion: 1, mode: "SCHEDULED", humanGracePeriodSeconds: 60, scheduleWindows: [{weekday: "MONDAY", startMinute: 600, endMinute: 660, enabled: true}]});
    await expect(planner.execute({triggeredAt: new Date("2026-09-07T05:00:00.000Z")})).resolves.toEqual({
      status: "scheduled",
      notBefore: new Date("2026-09-07T06:30:00.000Z"),
      continuationNotBefore: new Date("2026-09-07T06:30:00.000Z"),
    });
    await expect(planner.execute({triggeredAt: new Date("2026-09-07T07:29:30.000Z")})).resolves.toEqual({
      status: "scheduled",
      notBefore: null,
      continuationNotBefore: new Date("2026-09-07T07:29:30.000Z"),
    });
    emergency.value = {active: true, state: "ACTIVE"};
    await expect(planner.execute({triggeredAt: new Date()})).resolves.toEqual({status: "suppressed", reason: "EMERGENCY_DISABLED"});
  });

  it("lets all valid Staff roles read status and audit while preserving management boundaries", async () => {
    const repository = new FakeAiOperationsRepository();
    const emergency = new FakeAiOperationsEmergencyOverride();
    const clock = new FakeAiOperationsClock();
    for (const role of ["SUPER_ADMIN", "ADMIN", "SALES", "VIEWER"] as const) {
      await expect(new GetAiOperationsPolicy(repository, authorization, emergency, clock).execute(principal(role))).resolves.toMatchObject({status: "found"});
      await expect(new ReadAiOperationsAuditHistory(repository, authorization).execute(principal(role))).resolves.toEqual({status: "found", events: []});
    }
    expect(authorization.mayManageAiOperations(principal("ADMIN"))).toBe(true);
    expect(authorization.mayManageAiOperations(principal("SALES"))).toBe(false);
  });
});
