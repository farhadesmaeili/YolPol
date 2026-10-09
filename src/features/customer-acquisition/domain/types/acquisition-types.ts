export type SourceObservation = Readonly<{
  system: string; recordId: string | null; url: string | null; observedAt: string; runReference: string;
}>;
export type CompanyObservation = Readonly<{
  synthetic: true; idempotencyKey: string;
  company: Readonly<{name: string; country: string; domain: string}>;
  contact: Readonly<{name: string; email: string; normalizedEmail: string}> | null;
  segment: string; source: SourceObservation;
}>;
export type AcquisitionResult = Readonly<{
  status: "CREATED" | "EXISTING" | "REVIEW_REQUIRED" | "ASSESSED" | "SUPPRESSED" | "RELEASED";
  companyId?: string; contactId?: string; leadId?: string; observationId?: string;
  assessmentId?: string; suppressionId?: string;
  reason?: "IDENTITY_CONFLICT" | "POSSIBLE_NAME_MATCH";
  score?: number; decision?: "REVIEW_REQUIRED" | "FOUNDATION_FIT" | "BLOCKED";
}>;
export type QualificationInput = Readonly<{
  idempotencyKey: string; leadId: string; policyVersion: "foundation-v1";
  facts: Readonly<{marketMatch: boolean; segmentMatch: boolean; packagingRelevance: boolean}>;
}>;
export type SuppressionInput = Readonly<{
  idempotencyKey: string; kind: "DOMAIN" | "EMAIL"; target: string;
  reason: "TEST_OPT_OUT" | "MANUAL_REVIEW"; sourceReference: string;
}>;
export type ReleaseSuppressionInput = Readonly<{idempotencyKey: string; suppressionId: string}>;
export class AcquisitionValidationError extends Error {
  constructor() { super("Invalid acquisition input."); this.name = "AcquisitionValidationError"; }
}
export class AcquisitionConflictError extends Error {
  constructor() { super("Acquisition request conflicts with existing state."); this.name = "AcquisitionConflictError"; }
}
export class AcquisitionNotFoundError extends Error {
  constructor() { super("Acquisition record not found."); this.name = "AcquisitionNotFoundError"; }
}
