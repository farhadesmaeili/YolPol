import type {CheckReadiness} from "@/features/health/application/use-cases/check-readiness";
import {presentLiveness, presentReadiness} from "@/features/health/presentation/presenters/health-response-presenter";
import {isSafeRequestId, requestIdHeader} from "@/shared/infrastructure/http/request-id";

export function createLivenessRequestHandler(): () => Promise<Response> {
  return async () => presentLiveness();
}

export function createReadinessRequestHandler(checkReadiness: CheckReadiness): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = request.headers.get(requestIdHeader);
    return presentReadiness(await checkReadiness.execute({
      requestId: isSafeRequestId(requestId) ? requestId : null,
    }));
  };
}
