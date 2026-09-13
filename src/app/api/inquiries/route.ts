import {getInquirySubmission} from "@/composition/inquiries/inquiry-submission";
import {getInquiryHttpOptions} from "@/composition/inquiries/inquiry-http";
import {createInquiryRequestHandler} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createInquiryRequestHandler(getInquirySubmission, getInquiryHttpOptions());
