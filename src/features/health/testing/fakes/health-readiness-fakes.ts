import type {
  ApplicationReadinessProbe,
  DatabaseReadinessProbe,
  HealthDiagnosticLogger,
  ReadinessFailureCheck,
} from "@/features/health/application/ports/health-readiness-ports";
import type {BuildIdentity} from "@/features/health/domain/types/health-status";

export class FakeApplicationReadinessProbe implements ApplicationReadinessProbe {
  constructor(
    public build: BuildIdentity = {version: "0.1.0"},
    public failure?: unknown,
  ) {}

  check(): BuildIdentity {
    if (this.failure !== undefined) throw this.failure;
    return this.build;
  }
}

export class FakeDatabaseReadinessProbe implements DatabaseReadinessProbe {
  calls = 0;

  constructor(public failure?: unknown) {}

  async check(): Promise<void> {
    this.calls += 1;
    if (this.failure !== undefined) throw this.failure;
  }
}

export class FakeHealthDiagnosticLogger implements HealthDiagnosticLogger {
  readonly failures: Array<Readonly<{check: ReadinessFailureCheck; requestId: string | null; error: unknown}>> = [];

  readinessFailed(input: Readonly<{check: ReadinessFailureCheck; requestId: string | null; error: unknown}>): void {
    this.failures.push(input);
  }
}
