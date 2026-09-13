import createMiddleware from "next-intl/middleware";
import {NextResponse, type NextRequest} from "next/server";

import {routing} from "@/i18n/routing";
import {searchEngineResponseDirective} from "@/shared/config/deployment-environment";
import {requestIdHeader, resolveRequestId} from "@/shared/infrastructure/http/request-id";

const handleInternationalizedRouting = createMiddleware(routing);

export function applySearchIndexingPolicy(response: Response): Response {
  const directive = searchEngineResponseDirective();
  if (directive) response.headers.set("X-Robots-Tag", directive);
  return response;
}

export function applyRequestIdResponseHeader(response: Response, requestId: string): Response {
  response.headers.set(requestIdHeader, requestId);
  return response;
}

export default function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(requestIdHeader));
  let response: Response;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(requestIdHeader, requestId);
    response = NextResponse.next({request: {headers: requestHeaders}});
  } else {
    response = handleInternationalizedRouting(request);
  }

  return applyRequestIdResponseHeader(applySearchIndexingPolicy(response), requestId);
}

export const config = {
  matcher: "/((?!_next|_vercel|.*\\..*).*)",
};
