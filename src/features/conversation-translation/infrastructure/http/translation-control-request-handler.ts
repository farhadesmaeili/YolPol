import type {ConversationTranslationControlDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ChangeConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/change-conversation-translation-control";
import type {GetConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/get-conversation-translation-control";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {parseTranslationControlPayload} from "@/features/conversation-translation/infrastructure/validation/translation-control-payload";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const translationControlRequestSizeLimit = 8 * 1_024;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Control = Readonly<{
  change: Pick<ChangeConversationTranslationControl, "execute">;
  get: Pick<GetConversationTranslationControl, "execute">;
}>;
type Options = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Readonly<{NODE_ENV?: string}>;
  rateLimiter: Readonly<{consume(): Readonly<{allowed: boolean; retryAfterSeconds?: number}>}>;
}>;
type Context = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;

const json = (body: Readonly<Record<string, unknown>>, status: number, headers?: HeadersInit) => Response.json(body, {status, headers: {"Cache-Control": "no-store", ...headers}});
const failure = (code: string, status: number, field?: string, headers?: HeadersInit) => json({status: "error", code, ...(field ? {field} : {})}, status, headers);

export function createTranslationControlRequestHandler(getAccess: () => Access, getControl: () => Control, options: Options) {
  return async function handle(request: Request, context: Context): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    let url: URL;
    try { url = new URL(request.url); } catch { return failure("invalid_request", 400); }
    if (url.search.length > 0) return failure("invalid_request", 400, "query");
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return failure("unauthorized", 401);
    let session: ResolveStaffSessionResult;
    try { session = await getAccess().resolveSession.execute({sessionCredential: credential}); }
    catch { return failure("service_unavailable", 503); }
    if (session.status === "unauthorized") return failure("unauthorized", 401);
    if (session.status !== "authenticated") return failure("service_unavailable", 503);
    const rateLimit = options.rateLimiter.consume();
    if (!rateLimit.allowed) return failure("rate_limited", 429, undefined, {"Retry-After": String(rateLimit.retryAfterSeconds ?? 1)});
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readJsonBodyWithinLimit(request, translationControlRequestSizeLimit, "Translation control request exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status !== "success") return failure("invalid_request", 400);
    const parsed = parseTranslationControlPayload(body.value);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);
    let inquiryId: string;
    try { inquiryId = (await context.params).inquiryId; } catch { return failure("invalid_request", 400, "inquiryId"); }
    let control: Control;
    let changed: Awaited<ReturnType<ChangeConversationTranslationControl["execute"]>>;
    try {
      control = getControl();
      changed = await control.change.execute({...parsed.value, inquiryId, principal: session.principal});
    } catch { return failure("service_unavailable", 503); }
    if (changed.status === "forbidden") return failure("forbidden", 403);
    if (changed.status === "not_found") return failure("not_found", 404);
    if (changed.status === "conflict") return failure("version_conflict", 409);
    if (changed.status === "validation_failed") return failure("invalid_request", 400, changed.field);
    if (changed.status !== "updated") return failure("service_unavailable", 503);
    const current = await control.get.execute({inquiryId, principal: session.principal});
    return current.status === "found"
      ? json({status: "updated", value: current.value as ConversationTranslationControlDto}, 200)
      : failure("service_unavailable", 503);
  };
}
