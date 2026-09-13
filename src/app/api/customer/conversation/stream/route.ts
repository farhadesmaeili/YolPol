import {customerResumeStreamHandler} from "@/composition/inquiries/customer-conversation-stream-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customerResumeStreamHandler;
