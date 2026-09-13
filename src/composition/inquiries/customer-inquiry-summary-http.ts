import "server-only";

import {getConversationAccessResolver} from "@/composition/inquiries/conversation-access";
import {getInquiryRepository} from "@/composition/inquiries/inquiry-persistence";
import {getCustomerConversationHistoryHttpOptions} from "@/composition/inquiries/inquiry-http";
import {GetCustomerInquirySummary} from "@/features/inquiries/application/use-cases/get-customer-inquiry-summary";
import {createCustomerInquirySummaryRequestHandler} from "@/features/inquiries/infrastructure/http/customer-inquiry-summary-request-handler";

export const customerInquirySummaryGetHandler = createCustomerInquirySummaryRequestHandler(
  getConversationAccessResolver,
  () => new GetCustomerInquirySummary(getInquiryRepository()),
  getCustomerConversationHistoryHttpOptions(),
);
