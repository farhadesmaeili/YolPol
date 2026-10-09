import type {AcquisitionRepository} from "@/features/customer-acquisition/application/ports/acquisition-repository";
import type {CompanyObservation, QualificationInput, ReleaseSuppressionInput, SuppressionInput} from "@/features/customer-acquisition/domain/types/acquisition-types";

export class CustomerAcquisition {
  constructor(private readonly repository: AcquisitionRepository) {}
  ingest(input: CompanyObservation) { return this.repository.ingest(input); }
  qualify(input: QualificationInput) { return this.repository.qualify(input); }
  suppress(input: SuppressionInput) { return this.repository.suppress(input); }
  release(input: ReleaseSuppressionInput) { return this.repository.release(input); }
  ready() { return this.repository.ready(); }
}
