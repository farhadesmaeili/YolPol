import {createHash, timingSafeEqual} from "node:crypto";

import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import type {ReceiveTelegramReplyResult} from "@/features/inquiries/application/results/receive-telegram-reply-result";
import {classifyTelegramUpdate} from "@/features/inquiries/infrastructure/communication/telegram/telegram-update-parser";
import type {TelegramStartCommand} from "@/features/telegram-staff-onboarding/application/dto/telegram-start-command";

export const telegramWebhookRequestSizeLimit = 64 * 1024;
const telegramSecretHeader = "x-telegram-bot-api-secret-token";

type TelegramReplyGateway = Readonly<{execute(reply: ExternalChannelReply): Promise<ReceiveTelegramReplyResult>}>;
type TelegramStartGateway = Readonly<{execute(command: TelegramStartCommand): Promise<void>}>;
type ErrorCode = "invalid_secret" | "invalid_request" | "invalid_update" | "payload_too_large" | "unsupported_media_type" | "service_unavailable";

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number) => json({status: "error", code}, status);
const accepted = () => json({status: "accepted"}, 200);

function secretMatches(actual: string | null, expected: string): boolean {
  if (actual === null || expected.length === 0) return false;
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

type BodyReadResult = Readonly<{status: "success"; value: unknown}> | Readonly<{status: "invalid"}> | Readonly<{status: "too_large"}>;

async function readBody(request: Request): Promise<BodyReadResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared)) return {status: "invalid"};
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes)) return {status: "invalid"};
    if (declaredBytes > telegramWebhookRequestSizeLimit) return {status: "too_large"};
  }
  if (!request.body) return {status: "invalid"};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > telegramWebhookRequestSizeLimit) {
        try { await reader.cancel("Telegram webhook body exceeds limit."); } catch { /* The 413 response remains authoritative. */ }
        return {status: "too_large"};
      }
      chunks.push(value);
    }
  } catch {
    return {status: "invalid"};
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    return {status: "success", value: JSON.parse(text)};
  } catch {
    return {status: "invalid"};
  }
}

export function createTelegramWebhookHandler(
  getReplyGateway: () => TelegramReplyGateway,
  getStartGateway: () => TelegramStartGateway,
  getWebhookSecret: () => string,
) {
  return async function handle(request: Request): Promise<Response> {
    let webhookSecret: string;
    try { webhookSecret = getWebhookSecret(); } catch { return failure("service_unavailable", 503); }
    if (!secretMatches(request.headers.get(telegramSecretHeader), webhookSecret)) return failure("invalid_secret", 401);

    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readBody(request);
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status === "invalid") return failure("invalid_request", 400);
    const update = classifyTelegramUpdate(body.value);
    if (update.status === "invalid") return failure("invalid_update", 400);
    if (update.status === "ignored") return accepted();
    if (update.status === "staff_connection_start") {
      try { await getStartGateway().execute(update.command); }
      catch { return failure("service_unavailable", 503); }
      return accepted();
    }

    let result: ReceiveTelegramReplyResult;
    try { result = await getReplyGateway().execute(update.reply); } catch { return failure("service_unavailable", 503); }
    switch (result.status) {
      case "created":
      case "duplicate":
      case "unauthorized":
      case "conversation_not_found":
      case "invalid_reply": return accepted();
      case "persistence_failed": return failure("service_unavailable", 503);
    }
  };
}
