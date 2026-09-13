import type {
  ApplicationReadinessProbe,
  DatabaseReadinessProbe,
  HealthDiagnosticLogger,
} from "@/features/health/application/ports/health-readiness-ports";
import type {ReadinessResult} from "@/features/health/domain/types/health-status";

export class CheckReadiness {
  constructor(
    private readonly application: ApplicationReadinessProbe,
    private readonly database: DatabaseReadinessProbe,
    private readonly logger: HealthDiagnosticLogger,
  ) {}

  async execute(input: Readonly<{requestId: string | null}>): Promise<ReadinessResult> {
    let build;
    try {
      build = this.application.check();
    } catch (error) {
      this.logger.readinessFailed({check: "application", requestId: input.requestId, error});
      return {status: "unavailable", checks: {application: "failed", database: "not_checked"}};
    }

    try {
      await this.database.check();
    } catch (error) {
      this.logger.readinessFailed({check: "database", requestId: input.requestId, error});
      return {status: "unavailable", checks: {application: "ok", database: "failed"}, build};
    }

    return {status: "ok", checks: {application: "ok", database: "ok"}, build};
  }
}
