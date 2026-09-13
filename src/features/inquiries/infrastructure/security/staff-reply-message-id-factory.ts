import {createHash} from "node:crypto";

import type {StaffReplyMessageIdFactory} from "@/features/inquiries/application/ports/conversation-ports";

const domainSeparator = "yolpol:staff-conversation-reply:v1";

export class NodeStaffReplyMessageIdFactory implements StaffReplyMessageIdFactory {
  create(actorReference: string, inquiryId: string, clientMessageId: string): string {
    const digest = createHash("sha256")
      .update(domainSeparator)
      .update("\0")
      .update(actorReference)
      .update("\0")
      .update(inquiryId)
      .update("\0")
      .update(clientMessageId)
      .digest("hex");
    return `staff_web_${digest}`;
  }
}
