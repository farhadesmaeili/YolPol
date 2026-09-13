import {customerConversationGetHandler, customerConversationPostHandler} from "@/composition/inquiries/customer-conversation-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customerConversationGetHandler;
export const POST = customerConversationPostHandler;
