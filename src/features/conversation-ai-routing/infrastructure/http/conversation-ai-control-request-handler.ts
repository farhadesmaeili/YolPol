import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import type {ConversationAiStatusDto} from "@/features/conversation-ai-routing/application/dto/conversation-ai-routing-dto";
import {parseConversationAiControlPayload} from "@/features/conversation-ai-routing/infrastructure/validation/conversation-ai-control-payload";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const conversationAiControlRequestSizeLimit = 8 * 1_024;
type RouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;
type Access = Readonly<{
  resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>;
  authorization: Readonly<{actorReferenceFor(principal: StaffPrincipal): string}>;
}>;
type Routing = Readonly<{
  changeControl: Readonly<{execute(input: Readonly<{inquiryId: string; state: unknown; expectedVersion: unknown; actorReference: string; principal: StaffPrincipal}>): Promise<Readonly<{status: string; field?: string}>>}>;
  getStatus: Readonly<{execute(input: Readonly<{inquiryId: string; principal: StaffPrincipal}>): Promise<Readonly<{status: string; value?: ConversationAiStatusDto}>>}>;
}>;
type Options = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Readonly<{NODE_ENV?: string}>;
  rateLimiter: Readonly<{consume(): Readonly<{allowed: boolean; retryAfterSeconds?: number}>}>;
}>;

const json = (body: Readonly<Record<string, unknown>>, status: number, headers?: HeadersInit) => Response.json(body, {status, headers: {"Cache-Control": "no-store", ...headers}});
const failure = (code: string, status: number, field?: string, headers?: HeadersInit) => json({status: "error", code, ...(field ? {field} : {})}, status, headers);

export function createConversationAiControlRequestHandler(getAccess: () => Access, getRouting: () => Routing, options: Options) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    let url: URL;
    try { url = new URL(request.url); } catch { return failure("invalid_request", 400); }
    if (url.search.length > 0) return failure("invalid_request", 400, "query");
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return failure("unauthorized", 401);
    let principal: StaffPrincipal;
    let actorReference: string;
    try {
      const access = getAccess();
      const session = await access.resolveSession.execute({sessionCredential: credential});
      if (session.status === "unauthorized") return failure("unauthorized", 401);
      if (session.status !== "authenticated") return failure("service_unavailable", 503);
      principal = session.principal;
      actorReference = access.authorization.actorReferenceFor(principal);
    } catch { return failure("service_unavailable", 503); }
    const rateLimit = options.rateLimiter.consume();
    if (!rateLimit.allowed) return failure("rate_limited", 429, undefined, {"Retry-After": String(rateLimit.retryAfterSeconds ?? 1)});
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readJsonBodyWithinLimit(request, conversationAiControlRequestSizeLimit, "Conversation AI control request exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status !== "success") return failure("invalid_request", 400);
    const parsed = parseConversationAiControlPayload(body.value);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);
    let inquiryId: string;
    try { inquiryId = (await context.params).inquiryId; } catch { return failure("invalid_request", 400, "inquiryId"); }
    const routing = getRouting();
    const result = await routing.changeControl.execute({...parsed.value, inquiryId, actorReference, principal});
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status === "not_found") return failure("not_found", 404);
    if (result.status === "conflict") return failure("version_conflict", 409);
    if (result.status === "validation_failed") return failure("invalid_request", 400, result.field);
    if (result.status !== "updated") return failure("service_unavailable", 503);
    const status = await routing.getStatus.execute({inquiryId, principal});
    return status.status === "found" && status.value ? json({status: "updated", value: status.value}, 200) : failure("service_unavailable", 503);
  };
}
