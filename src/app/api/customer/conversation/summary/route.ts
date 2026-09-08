import {customerInquirySummaryGetHandler} from "@/composition/inquiries/customer-inquiry-summary-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = customerInquirySummaryGetHandler;
