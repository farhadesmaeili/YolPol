import type {ReadinessResult} from "@/features/health/domain/types/health-status";

const healthResponseHeaders = Object.freeze({"Cache-Control": "no-store"});

export function presentLiveness(): Response {
  return Response.json({status: "ok"}, {status: 200, headers: healthResponseHeaders});
}

export function presentReadiness(result: ReadinessResult): Response {
  const body = {
    status: result.status,
    checks: result.checks,
    ...(result.build ?? {}),
  };
  return Response.json(body, {
    status: result.status === "ok" ? 200 : 503,
    headers: healthResponseHeaders,
  });
}
