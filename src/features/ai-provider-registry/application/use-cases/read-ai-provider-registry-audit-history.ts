import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {AiProviderRegistryEventDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import type {AiProviderRegistryRepository} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";

export class ReadAiProviderRegistryAuditHistory {
  constructor(private readonly repository: AiProviderRegistryRepository, private readonly authorization: StaffAuthorization) {}
  async execute(principal: StaffPrincipal, limit = 100): Promise<Readonly<{status: "found"; events: readonly AiProviderRegistryEventDto[]}> | Readonly<{status: "forbidden" | "unavailable"}>> {
    if (!this.authorization.mayViewAiProviderRegistry(principal)) return {status: "forbidden"};
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return {status: "unavailable"};
    try { return {status: "found", events: await this.repository.readEvents(limit)}; } catch { return {status: "unavailable"}; }
  }
}
