import type {RemediateTranslation} from "@/features/conversation-translation/application/use-cases/remediate-translation";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Readonly<{NODE_ENV?: string}>;
  rateLimiter: Readonly<{consume(): Readonly<{allowed: boolean; retryAfterSeconds?: number}>}>}>;
const response = (status: number, code: string) => Response.json({status: code}, {status, headers: {"Cache-Control": "no-store"}});

export function createTranslationRemediationRequestHandler(getAccess: () => Access, getRemediation: () => Pick<RemediateTranslation, "execute">, options: Options) {
  return async (request: Request, context: Readonly<{params: Promise<Readonly<{inquiryId: string; messageId: string}>>}>): Promise<Response> => {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return response(403, "invalid_origin");
    if (new URL(request.url).search) return response(400, "invalid_request");
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return response(401, "unauthorized");
    try {
      const session = await getAccess().resolveSession.execute({sessionCredential: credential});
      if (session.status !== "authenticated") return response(session.status === "unauthorized" ? 401 : 503, session.status);
      if (!options.rateLimiter.consume().allowed) return response(429, "rate_limited");
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return response(415, "unsupported_media_type");
      const body = await readJsonBodyWithinLimit(request, 1024, "Translation request exceeds limit.");
      if (body.status !== "success") return response(body.status === "too_large" ? 413 : 400, "invalid_request");
      const result = await getRemediation().execute({...await context.params, principal: session.principal, payload: body.value});
      const status = result.status === "updated" ? 200 : result.status === "forbidden" ? 403 : result.status === "not_found" ? 404
        : result.status === "conflict" ? 409 : result.status === "validation_failed" ? 400 : 503;
      return response(status, result.status);
    } catch { return response(503, "service_unavailable"); }
  };
}
