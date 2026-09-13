import {handleStaffConversationStream} from "@/composition/inquiries/conversation-typing-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleStaffConversationStream;
