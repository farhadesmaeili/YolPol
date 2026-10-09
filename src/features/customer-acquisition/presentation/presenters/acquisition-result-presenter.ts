import type {AcquisitionResult} from "@/features/customer-acquisition/domain/types/acquisition-types";

export function presentAcquisitionResult(result: AcquisitionResult, requestId: string) {
  return {requestId, status: result.status,
    ...(result.companyId ? {companyId: result.companyId} : {}),
    ...(result.contactId ? {contactId: result.contactId} : {}),
    ...(result.leadId ? {leadId: result.leadId} : {}),
    ...(result.observationId ? {observationId: result.observationId} : {}),
    ...(result.assessmentId ? {assessmentId: result.assessmentId} : {}),
    ...(result.suppressionId ? {suppressionId: result.suppressionId} : {}),
    ...(result.reason ? {reason: result.reason} : {}),
    ...(result.score === undefined ? {} : {score: result.score, decision: result.decision})};
}
