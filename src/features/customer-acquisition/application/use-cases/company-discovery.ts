import type {DiscoveryRepository} from "@/features/customer-acquisition/application/ports/discovery-repository";
import {DiscoveryError, type DiscoveryBatchInput, type DiscoveryPrincipal, type EvidenceInput, type ReviewInput} from "@/features/customer-acquisition/domain/types/discovery-types";
import {discoveryUuid} from "@/features/customer-acquisition/domain/value-objects/discovery-values";

export class CompanyDiscovery {
  constructor(private readonly repository: DiscoveryRepository) {}
  private require(principal: DiscoveryPrincipal, capability: DiscoveryPrincipal["capability"]) {
    discoveryUuid(principal.id);
    if (principal.capability !== capability) throw new DiscoveryError("FORBIDDEN");
  }
  submit(principal: DiscoveryPrincipal, input: DiscoveryBatchInput) { this.require(principal, "INTAKE"); return this.repository.submit(principal, input); }
  batch(principal: DiscoveryPrincipal, id: string) {
    discoveryUuid(principal.id); discoveryUuid(id);
    if (principal.capability !== "INTAKE" && principal.capability !== "REVIEW") throw new DiscoveryError("FORBIDDEN");
    return this.repository.batch(principal, id);
  }
  queue(principal: DiscoveryPrincipal, after: string | null) { this.require(principal, "REVIEW"); return this.repository.queue(after === null ? null : discoveryUuid(after)); }
  evidence(principal: DiscoveryPrincipal, id: string, input: EvidenceInput) { this.require(principal, "REVIEW"); return this.repository.evidence(principal, discoveryUuid(id), input); }
  review(principal: DiscoveryPrincipal, id: string, input: ReviewInput) { this.require(principal, "REVIEW"); return this.repository.review(principal, discoveryUuid(id), input); }
}
