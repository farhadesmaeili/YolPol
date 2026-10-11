import {randomUUID} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {CompanyDiscovery} from "@/features/customer-acquisition/application/use-cases/company-discovery";
import type {DiscoveryRepository} from "@/features/customer-acquisition/application/ports/discovery-repository";
import {fixtureBatch} from "@/features/customer-acquisition/testing/fixtures/discovery-fixtures";
import type {DiscoveryPrincipal} from "@/features/customer-acquisition/domain/types/discovery-types";

describe("company discovery application capabilities", () => {
  it("enforces capabilities before persistence even without HTTP", () => {
    const repository: DiscoveryRepository = {submit: vi.fn(), batch: vi.fn(), queue: vi.fn(), evidence: vi.fn(), review: vi.fn()};
    const app = new CompanyDiscovery(repository);
    const intake: DiscoveryPrincipal = {id: randomUUID(), capability: "INTAKE"};
    const reviewer: DiscoveryPrincipal = {id: randomUUID(), capability: "REVIEW"};
    expect(() => app.submit(reviewer, fixtureBatch())).toThrow("FORBIDDEN");
    expect(() => app.queue(intake, null)).toThrow("FORBIDDEN");
    expect(() => app.review(intake, randomUUID(), {idempotencyKey: "test", expectedVersion: 0, decision: "REJECT", reason: "INSUFFICIENT_EVIDENCE", findingId: null})).toThrow("FORBIDDEN");
    expect(repository.submit).not.toHaveBeenCalled(); expect(repository.queue).not.toHaveBeenCalled(); expect(repository.review).not.toHaveBeenCalled();
  });
});
