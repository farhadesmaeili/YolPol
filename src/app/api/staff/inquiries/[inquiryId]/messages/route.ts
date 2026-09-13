import {handleStaffConversationReply} from "@/composition/inquiries/staff-conversation-reply-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleStaffConversationReply;
