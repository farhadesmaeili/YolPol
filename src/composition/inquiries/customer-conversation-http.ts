import "server-only";

import {getConversationAccessResolver} from "@/composition/inquiries/conversation-access";
import {getCustomerMessageHistory, getCustomerMessageReceiver} from "@/composition/inquiries/customer-message";
import {getCustomerConversationHistoryHttpOptions, getCustomerConversationMessageHttpOptions} from "@/composition/inquiries/inquiry-http";
import {createCustomerConversationHistoryRequestHandler, createCustomerConversationMessageRequestHandler} from "@/features/inquiries/infrastructure/http/customer-conversation-request-handler";

export const customerConversationGetHandler = createCustomerConversationHistoryRequestHandler(getConversationAccessResolver, getCustomerMessageHistory, getCustomerConversationHistoryHttpOptions());
export const customerConversationPostHandler = createCustomerConversationMessageRequestHandler(getConversationAccessResolver, getCustomerMessageReceiver, getCustomerConversationMessageHttpOptions());
