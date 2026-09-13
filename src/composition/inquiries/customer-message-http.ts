import "server-only";

import {getCustomerMessageHistory, getCustomerMessageReceiver} from "@/composition/inquiries/customer-message";
import {getCustomerMessageHistoryHttpOptions, getCustomerMessageHttpOptions} from "@/composition/inquiries/inquiry-http";
import {createCustomerMessageHistoryRequestHandler} from "@/features/inquiries/infrastructure/http/customer-message-history-request-handler";
import {createCustomerMessageRequestHandler} from "@/features/inquiries/infrastructure/http/customer-message-request-handler";

export const customerMessageGetHandler = createCustomerMessageHistoryRequestHandler(getCustomerMessageHistory, getCustomerMessageHistoryHttpOptions());
export const customerMessagePostHandler = createCustomerMessageRequestHandler(getCustomerMessageReceiver, getCustomerMessageHttpOptions());
