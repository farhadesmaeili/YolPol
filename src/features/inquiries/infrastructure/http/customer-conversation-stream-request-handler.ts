import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import type {StreamConversationUpdatesResult} from "@/features/inquiries/application/results/stream-conversation-updates-result";
import type {ResolveConversationByAccessTokenResult} from "@/features/inquiries/application/results/resolve-conversation-by-access-token-result";
import {originAllowed} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

type AccessResolver = Readonly<{execute(input: Readonly<{token: string}>): Promise<ResolveConversationByAccessTokenResult>}>;
type ConversationStreamer = Readonly<{open(input: Readonly<{
  conversationId: string;
  inquiryId: string;
  afterCursor: number;
  signal: AbortSignal;
  onUpdate: (update: ConversationMessageUpdate) => void;
  onUnavailable: () => void;
}>): StreamConversationUpdatesResult}>;
type ConversationStreamRouteContext = Readonly<{params: Promise<Readonly<{token: string}>>}>;
type ConversationStreamHttpOptions = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; heartbeatIntervalMs?: number}>;
type ErrorCode = "invalid_origin" | "invalid_request" | "service_unavailable" | "unauthorized";

const encoder = new TextEncoder();
const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number) => json({status: "error", code}, status);

function readAfterCursor(request: Request): number | null {
  const value = request.headers.get("last-event-id");
  if (value === null || value === "") return -1;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor <= 2_147_483_647 ? cursor : null;
}

function messageFrame(update: ConversationMessageUpdate): Uint8Array {
  return encoder.encode(`id: ${update.cursor}\nevent: message\ndata: ${JSON.stringify(update.message)}\n\n`);
}

export function createCustomerConversationStreamRequestHandler(
  getResolver: () => AccessResolver,
  getStreamer: () => ConversationStreamer,
  options: ConversationStreamHttpOptions = {},
) {
  return async function handle(request: Request, context: ConversationStreamRouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const afterCursor = readAfterCursor(request);
    if (afterCursor === null) return failure("invalid_request", 400);

    let token: string;
    try { ({token} = await context.params); }
    catch { return failure("invalid_request", 400); }

    let access: ResolveConversationByAccessTokenResult;
    try { access = await getResolver().execute({token}); }
    catch { return failure("service_unavailable", 503); }
    if (access.status === "unauthorized") return failure("unauthorized", 401);
    if (access.status !== "resolved") return failure("service_unavailable", 503);

    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closeSession: (() => void) | null = null;
    let finished = false;
    const enqueue = (value: Uint8Array) => {
      if (finished || !streamController) return;
      try { streamController.enqueue(value); }
      catch {
        finished = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        closeSession?.();
      }
    };

    let opened: StreamConversationUpdatesResult;
    try {
      opened = getStreamer().open({
        conversationId: access.conversationId,
        inquiryId: access.inquiryId,
        afterCursor,
        signal: request.signal,
        onUpdate: (update) => enqueue(messageFrame(update)),
        onUnavailable: () => enqueue(encoder.encode("event: error\ndata: {\"code\":\"service_unavailable\"}\n\n")),
      });
    } catch {
      return failure("service_unavailable", 503);
    }
    if (opened.status !== "opened") return failure(opened.status === "validation_failed" ? "invalid_request" : "service_unavailable", opened.status === "validation_failed" ? 400 : 503);

    const {session} = opened;
    closeSession = session.close;
    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      session.close();
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        enqueue(encoder.encode(": connected\nretry: 3000\n\n"));
        heartbeat = setInterval(() => enqueue(encoder.encode(": keep-alive\n\n")), options.heartbeatIntervalMs ?? 15_000);
        void session.completed.finally(() => {
          if (finished) return;
          finished = true;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          try { controller.close(); } catch { /* Cancellation may already have closed the HTTP stream. */ }
        });
      },
      cancel() {
        finished = true;
        cleanup();
      },
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
