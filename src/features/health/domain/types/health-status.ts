export type HealthCheckStatus = "ok" | "failed" | "not_checked";

export type BuildIdentity = Readonly<{
  version: string;
  revision?: string;
}>;

export type ReadinessResult =
  | Readonly<{
    status: "ok";
    checks: Readonly<{application: "ok"; database: "ok"}>;
    build: BuildIdentity;
  }>
  | Readonly<{
    status: "unavailable";
    checks: Readonly<{
      application: HealthCheckStatus;
      database: HealthCheckStatus;
    }>;
    build?: BuildIdentity;
  }>;
