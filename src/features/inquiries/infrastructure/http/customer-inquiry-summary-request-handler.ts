import type {GetCustomerInquirySummary} from "@/features/inquiries/application/use-cases/get-customer-inquiry-summary";
import type {ResolveConversationByAccessTokenResult} from "@/features/inquiries/application/results/resolve-conversation-by-access-token-result";
import {readCustomerConversationCookie, type CustomerConversationCookieEnvironment} from "@/features/inquiries/infrastructure/http/customer-conversation-cookie";
import {originAllowed} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";
import type {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";

export function createCustomerInquirySummaryRequestHandler(
  getResolver: () => {execute(input: {token: string}): Promise<ResolveConversationByAccessTokenResult>},
  getSummary: () => Pick<GetCustomerInquirySummary, "execute">,
  options: Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; rateLimiter?: InquiryRateLimiter}> = {},
  environment: CustomerConversationCookieEnvironment = process.env,
) {
  return async (request: Request): Promise<Response> => {
    const respond = (body: unknown, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return respond({status: "error"}, 403);
    const token = readCustomerConversationCookie(request, environment);
    if (!token) return respond({status: "error"}, 401);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) return respond({status: "error"}, 429);
    try {
      const access = await getResolver().execute({token});
      if (access.status !== "resolved") return respond({status: "error"}, access.status === "unauthorized" ? 401 : 503);
      const summary = await getSummary().execute({inquiryId: access.inquiryId});
      return summary ? respond({summary}, 200) : respond({status: "error"}, 401);
    } catch { return respond({status: "error"}, 503); }
  };
}
