import type {IndexNowKey} from "@/features/indexnow/domain/value-objects/indexnow-key";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
} as const;

export function createIndexNowKeyResponse(key: IndexNowKey): Response {
  return new Response(key, {status: 200, headers: responseHeaders});
}

export function createIndexNowKeyNotFoundResponse(): Response {
  return new Response("Not Found", {status: 404, headers: responseHeaders});
}

export function createIndexNowKeyUnavailableResponse(): Response {
  return new Response("Service Unavailable", {status: 503, headers: responseHeaders});
}
