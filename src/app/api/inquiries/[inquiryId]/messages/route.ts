import {customerMessagePostHandler} from "@/composition/inquiries/customer-message-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = customerMessagePostHandler;
