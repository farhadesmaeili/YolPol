import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import type {ConversationTypingRegistry, ConversationTypingSubscription} from "@/features/inquiries/application/ports/conversation-typing-ports";
import type {ResolveConversationForInquiryResult} from "@/features/inquiries/application/results/resolve-conversation-for-inquiry-result";
import type {StreamConversationUpdatesResult} from "@/features/inquiries/application/results/stream-conversation-updates-result";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {originAllowed} from "@/shared/infrastructure/http/strict-origin";

type StaffAccess = Readonly<{
  resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string; signal?: AbortSignal}>): Promise<ResolveStaffSessionResult>}>;
  authorization: Readonly<{mayViewCustomerConversation(principal: StaffPrincipal): boolean}>;
}>;
type ConversationResolver = Readonly<{execute(input: Readonly<{inquiryId: string}>): Promise<ResolveConversationForInquiryResult>}>;
type ConversationStreamer = Readonly<{open(input: Readonly<{
  conversationId: string;
  inquiryId: string;
  afterCursor: number;
  signal: AbortSignal;
  onUpdate: (update: ConversationMessageUpdate<StaffConversationMessageDto>) => void;
  onUnavailable: () => void;
}>): StreamConversationUpdatesResult}>;
type Environment = Readonly<{NODE_ENV?: string}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Environment; heartbeatIntervalMs?: number; reauthorizationIntervalMs?: number; reauthorizationTimeoutMs?: number}>;
type RouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;
type ErrorCode = "forbidden" | "invalid_origin" | "invalid_request" | "not_found" | "service_unavailable" | "unauthorized";

const encoder = new TextEncoder();
const maximumConversationCursor = 2_147_483_647;
export const staffStreamAuthorizationRevalidationIntervalMs = 5_000;
export const staffStreamAuthorizationCheckTimeoutMs = 5_000;
export const staffStreamMaximumAuthorizationPropagationDelayMs = staffStreamAuthorizationRevalidationIntervalMs + staffStreamAuthorizationCheckTimeoutMs;
const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);
const typingFrame = (isTyping: boolean) => encoder.encode(`event: typing\ndata: ${JSON.stringify({participant: "CUSTOMER", isTyping})}\n\n`);
const messageFrame = (update: ConversationMessageUpdate<StaffConversationMessageDto>) => encoder.encode(`id: ${update.cursor}\nevent: message\ndata: ${JSON.stringify(update.message)}\n\n`);

function parseCursor(value: string, allowEmptyHistory: boolean): number | null {
  if (allowEmptyHistory && value === "-1") return -1;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor <= maximumConversationCursor ? cursor : null;
}

function readAfterCursor(request: Request, requestUrl: URL): number | null {
  const cursorValues = requestUrl.searchParams.getAll("cursor");
  if ([...requestUrl.searchParams.keys()].some((key) => key !== "cursor") || cursorValues.length > 1) return null;

  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId !== null && lastEventId !== "") return parseCursor(lastEventId, false);
  if (cursorValues.length === 0) return -1;
  return parseCursor(cursorValues[0] ?? "", true);
}

export function createStaffConversationStreamRequestHandler(
  getAccess: () => StaffAccess,
  getConversation: () => ConversationResolver,
  getStreamer: () => ConversationStreamer,
  getTypingRegistry: () => ConversationTypingRegistry,
  options: Options = {},
) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return failure("unauthorized", 401);

    let access: StaffAccess;
    try {
      access = getAccess();
      const session = await access.resolveSession.execute({sessionCredential: credential, signal: request.signal});
      if (session.status === "unauthorized") return failure("unauthorized", 401);
      if (session.status !== "authenticated") return failure("service_unavailable", 503);
      if (!access.authorization.mayViewCustomerConversation(session.principal)) return failure("forbidden", 403);
    } catch {
      return failure("service_unavailable", 503);
    }

    let requestUrl: URL;
    try { requestUrl = new URL(request.url); }
    catch { return failure("invalid_request", 400, "request"); }
    const afterCursor = readAfterCursor(request, requestUrl);
    if (afterCursor === null) return failure("invalid_request", 400, "cursor");

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
    let typingSubscription: ConversationTypingSubscription | null = null;
    let closeSession: (() => void) | null = null;
    let reauthorization: ReturnType<typeof setInterval> | null = null;
    let reauthorizationTimeout: ReturnType<typeof setTimeout> | null = null;
    let reauthorizationController: AbortController | null = null;
    let reauthorizationInFlight = false;
    let finished = false;
    const pending: Uint8Array[] = [];
    const finish = (closeConversationSession: boolean) => {
      if (finished) return;
      finished = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      typingSubscription?.close();
      typingSubscription = null;
      if (reauthorization) clearInterval(reauthorization);
      if (reauthorizationTimeout) clearTimeout(reauthorizationTimeout);
      reauthorization = null;
      reauthorizationTimeout = null;
      const authorizationController = reauthorizationController;
      reauthorizationController = null;
      reauthorizationInFlight = false;
      authorizationController?.abort();
      if (closeConversationSession) closeSession?.();
      request.signal.removeEventListener("abort", cleanup);
      try { controller?.close(); } catch { /* Cancellation may already have closed the HTTP stream. */ }
    };
    const cleanup = () => finish(true);
    const enqueue = (value: Uint8Array) => {
      if (finished) return;
      if (!controller) { pending.push(value); return; }
      try { controller.enqueue(value); }
      catch { cleanup(); }
    };

    let opened: StreamConversationUpdatesResult;
    try {
      opened = getStreamer().open({
        conversationId: conversation.conversationId,
        inquiryId,
        afterCursor,
        signal: request.signal,
        onUpdate: (update) => enqueue(messageFrame(update)),
        onUnavailable: () => enqueue(encoder.encode("event: error\ndata: {\"code\":\"service_unavailable\"}\n\n")),
      });
    } catch {
      return failure("service_unavailable", 503);
    }
    if (opened.status !== "opened") {
      return failure(opened.status === "validation_failed" ? "invalid_request" : "service_unavailable", opened.status === "validation_failed" ? 400 : 503);
    }
    closeSession = opened.session.close;

    try {
      typingSubscription = getTypingRegistry().subscribe({
        conversationId: conversation.conversationId,
        participant: "CUSTOMER",
        listener: (event) => enqueue(typingFrame(event.isTyping)),
      });
    } catch {
      opened.session.close();
      return failure("service_unavailable", 503);
    }
    if (!typingSubscription) {
      opened.session.close();
      return failure("service_unavailable", 503);
    }

    if (request.signal.aborted) cleanup();
    else request.signal.addEventListener("abort", cleanup, {once: true});

    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        if (finished) {
          streamController.close();
          return;
        }
        enqueue(encoder.encode(": connected\nretry: 3000\n\n"));
        for (const frame of pending.splice(0)) enqueue(frame);
        heartbeat = setInterval(() => enqueue(encoder.encode(": keep-alive\n\n")), options.heartbeatIntervalMs ?? 15_000);
        reauthorization = setInterval(() => {
          if (finished || reauthorizationInFlight) return;
          const authorizationController = new AbortController();
          reauthorizationController = authorizationController;
          reauthorizationInFlight = true;
          reauthorizationTimeout = setTimeout(cleanup, options.reauthorizationTimeoutMs ?? staffStreamAuthorizationCheckTimeoutMs);
          void access.resolveSession.execute({sessionCredential: credential, signal: authorizationController.signal}).then((session) => {
            if (finished || reauthorizationController !== authorizationController) return;
            if (session.status !== "authenticated" || !access.authorization.mayViewCustomerConversation(session.principal)) cleanup();
          }).catch(() => {
            if (!finished && reauthorizationController === authorizationController) cleanup();
          }).finally(() => {
            if (reauthorizationController !== authorizationController) return;
            if (reauthorizationTimeout) clearTimeout(reauthorizationTimeout);
            reauthorizationTimeout = null;
            reauthorizationController = null;
            reauthorizationInFlight = false;
          });
        }, options.reauthorizationIntervalMs ?? staffStreamAuthorizationRevalidationIntervalMs);
        void opened.session.completed.finally(() => {
          finish(false);
        });
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
