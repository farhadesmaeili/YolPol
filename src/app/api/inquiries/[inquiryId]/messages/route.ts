import {customerMessageGetHandler, customerMessagePostHandler} from "@/composition/inquiries/customer-message-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customerMessageGetHandler;
export const POST = customerMessagePostHandler;
