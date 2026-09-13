import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

describe("Conversation typing persistence boundary", () => {
  it("keeps typing state out of persisted messages, workflow, outbox, assignments, and inquiry status", () => {
    const root = join(process.cwd(), "src", "features", "inquiries");
    const files = [
      join(root, "application", "ports", "conversation-typing-ports.ts"),
      join(root, "application", "use-cases", "update-conversation-typing.ts"),
      join(root, "infrastructure", "streaming", "in-memory-conversation-typing-registry.ts"),
      join(root, "infrastructure", "http", "customer-conversation-typing-request-handler.ts"),
      join(root, "infrastructure", "http", "staff-conversation-typing-request-handler.ts"),
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/conversation_messages|inquiry_workflow_events|inquiry_outbox|inquiry_assignments|ChangeInquiryStatus|AssignInquiry|appendForInquiry|drizzle-orm|inquiry-schema/u);
    expect(source).not.toMatch(/draft|message body|internalUnitPrice|Telegram|WhatsApp|email provider|SMS|AI provider/u);
  });
});
