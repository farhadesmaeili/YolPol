import type {
  HealthDiagnosticLogger,
  ReadinessFailureCheck,
} from "@/features/health/application/ports/health-readiness-ports";
import type {StructuredLogger} from "@/shared/infrastructure/observability/structured-logger";

export const readinessFailureLogIntervalMilliseconds = 60_000;

export class ThrottledHealthDiagnosticLogger implements HealthDiagnosticLogger {
  private readonly lastLoggedAt = new Map<ReadinessFailureCheck, number>();

  constructor(
    private readonly logger: Pick<StructuredLogger, "warn">,
    private readonly now: () => number = Date.now,
  ) {}

  readinessFailed(input: Readonly<{
    check: ReadinessFailureCheck;
    requestId: string | null;
    error: unknown;
  }>): void {
    const now = this.now();
    const lastLoggedAt = this.lastLoggedAt.get(input.check);
    if (lastLoggedAt !== undefined && now - lastLoggedAt < readinessFailureLogIntervalMilliseconds) return;
    this.lastLoggedAt.set(input.check, now);
    this.logger.warn("health.readiness_failed", input);
  }
}
