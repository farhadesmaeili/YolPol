import type {AiOperationsPolicyDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";

export function toAiOperationsPolicyDto(policy: AiOperationsPolicy): AiOperationsPolicyDto {
  return Object.freeze({
    mode: policy.mode,
    businessTimeZone: policy.businessTimeZone,
    humanGracePeriodSeconds: policy.humanGracePeriodSeconds,
    scheduleWindows: Object.freeze(policy.scheduleWindows.map((window) => Object.freeze({...window}))),
    version: policy.version,
    updatedAt: policy.updatedAt.toISOString(),
    updatedBy: policy.updatedBy,
  });
}
