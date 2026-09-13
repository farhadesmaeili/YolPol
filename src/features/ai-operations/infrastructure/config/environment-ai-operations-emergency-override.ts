import type {AiOperationsEmergencyOverride} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsEmergencyOverrideReader} from "@/features/ai-operations/application/ports/ai-operations-ports";

export function parseAiOperationsEmergencyOverride(value: string | undefined): AiOperationsEmergencyOverride {
  if (value === undefined || value.trim() === "" || value.trim().toLowerCase() === "false") return {active: false, state: "INACTIVE"};
  if (value.trim().toLowerCase() === "true") return {active: true, state: "ACTIVE"};
  return {active: true, state: "INVALID"};
}

export class EnvironmentAiOperationsEmergencyOverride implements AiOperationsEmergencyOverrideReader {
  constructor(private readonly environment: Readonly<Record<string, string | undefined>> = process.env) {}
  read(): AiOperationsEmergencyOverride { return parseAiOperationsEmergencyOverride(this.environment.YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED); }
}
