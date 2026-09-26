import {getIndexNowKeyVerificationResponse} from "@/composition/indexnow/indexnow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return getIndexNowKeyVerificationResponse();
}
