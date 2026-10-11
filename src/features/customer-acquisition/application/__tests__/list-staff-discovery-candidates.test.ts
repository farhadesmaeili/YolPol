import {describe, expect, it} from "vitest";

import {ListStaffDiscoveryCandidates} from "@/features/customer-acquisition/application/use-cases/list-staff-discovery-candidates";
import type {StaffDiscoveryReadResult} from "@/features/customer-acquisition/application/ports/staff-discovery-reader";
import {UnconfiguredStaffDiscoveryReader} from "@/features/customer-acquisition/infrastructure/readers/unconfigured-staff-discovery-reader";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {FakeStaffDiscoveryReader, syntheticReviewCandidate} from "@/features/customer-acquisition/testing/fakes/staff-discovery-reader";

const principal = (role: StaffPrincipal["role"]): StaffPrincipal => ({staffAccountId: "synthetic-account", teamMemberId: "synthetic-member", actorReference: "staff:synthetic-member", displayName: "Synthetic Staff", role});

describe("Staff discovery read boundary", () => {
  it.each([["SUPER_ADMIN", true], ["ADMIN", true], ["SALES", true], ["VIEWER", false]] as const)("maps %s to discovery access", (role, allowed) => {
    const policy = new StaffAuthorizationPolicy();
    expect(policy.mayViewDiscoveryCandidates(principal(role))).toBe(allowed);
    expect(policy.capabilitiesFor(principal(role)).mayViewDiscoveryCandidates).toBe(allowed);
  });

  it("rejects malformed principals and never calls a reader for an unauthorized role", async () => {
    const reader = new FakeStaffDiscoveryReader(new Map());
    const useCase = new ListStaffDiscoveryCandidates(reader, new StaffAuthorizationPolicy());
    await expect(useCase.execute(principal("VIEWER"))).resolves.toEqual({status: "forbidden"});
    await expect(useCase.execute({...principal("ADMIN"), actorReference: "staff:other"})).resolves.toEqual({status: "forbidden"});
    expect(reader.calls).toEqual([]);
  });

  it("distinguishes unconfigured, configured empty, populated and paginated queues", async () => {
    const policy = new StaffAuthorizationPolicy();
    await expect(new ListStaffDiscoveryCandidates(new UnconfiguredStaffDiscoveryReader(), policy).execute(principal("SALES")))
      .resolves.toEqual({status: "unavailable", reason: "unconfigured"});
    const first = {status: "available", page: {candidates: [syntheticReviewCandidate()], nextCursor: "synthetic-next"}} as const;
    const second = {status: "available", page: {candidates: [syntheticReviewCandidate(2), syntheticReviewCandidate(3)], nextCursor: null}} as const;
    const empty = {status: "available", page: {candidates: [], nextCursor: null}} as const;
    const reader = new FakeStaffDiscoveryReader(new Map<string | null, StaffDiscoveryReadResult>([[null, first], ["synthetic-next", second], ["empty", empty]]));
    const useCase = new ListStaffDiscoveryCandidates(reader, policy);
    await expect(useCase.execute(principal("ADMIN"))).resolves.toEqual(first);
    await expect(useCase.execute(principal("ADMIN"), "synthetic-next")).resolves.toEqual(second);
    await expect(useCase.execute(principal("ADMIN"), "empty")).resolves.toEqual(empty);
    expect(reader.calls).toEqual([null, "synthetic-next", "empty"]);
  });

  it("fails closed on reader failure", async () => {
    const useCase = new ListStaffDiscoveryCandidates({listCandidates: async () => { throw new Error("private failure"); }}, new StaffAuthorizationPolicy());
    await expect(useCase.execute(principal("ADMIN"))).resolves.toEqual({status: "unavailable", reason: "service_failure"});
  });
});
