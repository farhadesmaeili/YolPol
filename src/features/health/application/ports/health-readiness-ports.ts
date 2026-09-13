import type {BuildIdentity} from "@/features/health/domain/types/health-status";

export type ApplicationReadinessProbe = Readonly<{
  check(): BuildIdentity;
}>;

export type DatabaseReadinessProbe = Readonly<{
  check(): Promise<void>;
}>;

export type ReadinessFailureCheck = "application" | "database";

export type HealthDiagnosticLogger = Readonly<{
  readinessFailed(input: Readonly<{
    check: ReadinessFailureCheck;
    requestId: string | null;
    error: unknown;
  }>): void;
}>;
