import type {AcquisitionResult, CompanyObservation, QualificationInput, ReleaseSuppressionInput, SuppressionInput} from "@/features/customer-acquisition/domain/types/acquisition-types";

export interface AcquisitionRepository {
  ingest(input: CompanyObservation): Promise<AcquisitionResult>;
  qualify(input: QualificationInput): Promise<AcquisitionResult>;
  suppress(input: SuppressionInput): Promise<AcquisitionResult>;
  release(input: ReleaseSuppressionInput): Promise<AcquisitionResult>;
  ready(): Promise<boolean>;
}
