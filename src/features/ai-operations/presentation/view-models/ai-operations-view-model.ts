import type {AiOperationsPolicyEventDto, AiOperationsStatusDto} from "@/features/ai-operations/application/dto/ai-operations-dto";

export type AiOperationsViewModel = Readonly<{
  status: AiOperationsStatusDto;
  events: readonly AiOperationsPolicyEventDto[];
  mayManage: boolean;
}>;
