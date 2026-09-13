import {describe, expect, it} from "vitest";

import {NodeStaffReplyMessageIdFactory} from "@/features/inquiries/infrastructure/security/staff-reply-message-id-factory";

describe("NodeStaffReplyMessageIdFactory", () => {
  it("derives a stable opaque Message ID from trusted actor and client retry identities", () => {
    const factory = new NodeStaffReplyMessageIdFactory();
    const first = factory.create("staff:member-1", "inquiry-1", "019d-client-message-1");
    expect(first).toMatch(/^staff_web_[a-f0-9]{64}$/u);
    expect(factory.create("staff:member-1", "inquiry-1", "019d-client-message-1")).toBe(first);
    expect(factory.create("staff:member-2", "inquiry-1", "019d-client-message-1")).not.toBe(first);
    expect(factory.create("staff:member-1", "inquiry-2", "019d-client-message-1")).not.toBe(first);
    expect(factory.create("staff:member-1", "inquiry-1", "019d-client-message-2")).not.toBe(first);
    expect(first).not.toContain("member-1");
  });
});
