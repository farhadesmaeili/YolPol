import "server-only";

import {getCustomerMessageReceiver} from "@/composition/inquiries/customer-message";
import {getCustomerMessageHttpOptions} from "@/composition/inquiries/inquiry-http";
import {createCustomerMessageRequestHandler} from "@/features/inquiries/infrastructure/http/customer-message-request-handler";

export const customerMessagePostHandler = createCustomerMessageRequestHandler(getCustomerMessageReceiver, getCustomerMessageHttpOptions());
