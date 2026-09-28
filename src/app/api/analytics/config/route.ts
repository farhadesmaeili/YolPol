import {readGoogleAnalyticsRuntimeConfig} from "@/shared/config/google-analytics-runtime";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(readGoogleAnalyticsRuntimeConfig(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
