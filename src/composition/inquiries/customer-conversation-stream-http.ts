import "server-only";

import {getConversationAccessResolver} from "@/composition/inquiries/conversation-access";
import {getConversationTypingRegistry} from "@/composition/inquiries/conversation-typing";
import {getCustomerConversationStreamer} from "@/composition/inquiries/customer-conversation-stream";
import {getCustomerConversationStreamHttpOptions} from "@/composition/inquiries/inquiry-http";
import {createCustomerConversationStreamRequestHandler} from "@/features/inquiries/infrastructure/http/customer-conversation-stream-request-handler";

export const customerConversationStreamHandler = createCustomerConversationStreamRequestHandler(
  getConversationAccessResolver,
  getCustomerConversationStreamer,
  getCustomerConversationStreamHttpOptions(),
  getConversationTypingRegistry,
);
