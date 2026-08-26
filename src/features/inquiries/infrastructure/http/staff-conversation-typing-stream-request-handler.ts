import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import type {ConversationTypingRegistry, ConversationTypingSubscription} from "@/features/inquiries/application/ports/conversation-typing-ports";
import type {ResolveConversationForInquiryResult} from "@/features/inquiries/application/results/resolve-conversation-for-inquiry-result";
import {originAllowed} from "@/shared/infrastructure/http/strict-origin";

type StaffAccess = Readonly<{
  resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>;
  authorization: Readonly<{mayReplyToCustomerConversation(principal: StaffPrincipal): boolean}>;
}>;
type ConversationResolver = Readonly<{execute(input: Readonly<{inquiryId: string}>): Promise<ResolveConversationForInquiryResult>}>;
type Environment = Readonly<{NODE_ENV?: string}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Environment; heartbeatIntervalMs?: number}>;
type RouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;
type ErrorCode = "forbidden" | "invalid_origin" | "invalid_request" | "not_found" | "service_unavailable" | "unauthorized";

const encoder = new TextEncoder();
const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);
const typingFrame = (isTyping: boolean) => encoder.encode(`event: typing\ndata: ${JSON.stringify({participant: "CUSTOMER", isTyping})}\n\n`);

export function createStaffConversationTypingStreamRequestHandler(
  getAccess: () => StaffAccess,
  getConversation: () => ConversationResolver,
  getRegistry: () => ConversationTypingRegistry,
  options: Options = {},
) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return failure("unauthorized", 401);

    try {
      const access = getAccess();
      const session = await access.resolveSession.execute({sessionCredential: credential});
      if (session.status === "unauthorized") return failure("unauthorized", 401);
      if (session.status !== "authenticated") return failure("service_unavailable", 503);
      if (!access.authorization.mayReplyToCustomerConversation(session.principal)) return failure("forbidden", 403);
    } catch {
      return failure("service_unavailable", 503);
    }

    let requestUrl: URL;
    try { requestUrl = new URL(request.url); }
    catch { return failure("invalid_request", 400, "request"); }
    if (requestUrl.search.length > 0) return failure("invalid_request", 400, "query");
    let inquiryId: string;
    try { inquiryId = (await context.params).inquiryId; }
    catch { return failure("invalid_request", 400, "inquiryId"); }

    let conversation: ResolveConversationForInquiryResult;
    try { conversation = await getConversation().execute({inquiryId}); }
    catch { return failure("service_unavailable", 503); }
    if (conversation.status === "validation_failed") return failure("invalid_request", 400, "inquiryId");
    if (conversation.status === "conversation_not_found") return failure("not_found", 404);
    if (conversation.status !== "resolved") return failure("service_unavailable", 503);

    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let subscription: ConversationTypingSubscription | null = null;
    let finished = false;
    const pending: Uint8Array[] = [];
    const enqueue = (value: Uint8Array) => {
      if (finished) return;
      if (!controller) { pending.push(value); return; }
      try { controller.enqueue(value); }
      catch { cleanup(); }
    };
    const cleanup = () => {
      if (finished) return;
      finished = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      subscription?.close();
      subscription = null;
      request.signal.removeEventListener("abort", cleanup);
    };

    try {
      subscription = getRegistry().subscribe({
        conversationId: conversation.conversationId,
        participant: "CUSTOMER",
        listener: (event) => enqueue(typingFrame(event.isTyping)),
      });
    } catch {
      return failure("service_unavailable", 503);
    }
    if (!subscription) return failure("service_unavailable", 503);
    if (request.signal.aborted) cleanup();
    else request.signal.addEventListener("abort", cleanup, {once: true});

    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        streamController.enqueue(encoder.encode(": connected\nretry: 3000\n\n"));
        for (const frame of pending.splice(0)) streamController.enqueue(frame);
        heartbeat = setInterval(() => enqueue(encoder.encode(": keep-alive\n\n")), options.heartbeatIntervalMs ?? 15_000);
      },
      cancel() { cleanup(); },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
