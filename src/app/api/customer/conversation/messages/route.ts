import {customerResumePostHandler} from "@/composition/inquiries/customer-conversation-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = customerResumePostHandler;
