import createMiddleware from "next-intl/middleware";
import type {NextRequest} from "next/server";

import {routing} from "@/i18n/routing";
import {searchEngineResponseDirective} from "@/shared/config/deployment-environment";

const handleInternationalizedRouting = createMiddleware(routing);

export function applySearchIndexingPolicy(response: Response): Response {
  const directive = searchEngineResponseDirective();
  if (directive) response.headers.set("X-Robots-Tag", directive);
  return response;
}

export default function proxy(request: NextRequest) {
  return applySearchIndexingPolicy(handleInternationalizedRouting(request));
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
