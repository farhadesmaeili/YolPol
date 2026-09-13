import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

const browserFiles = [
  "src/features/inquiries/presentation/components/inquiry-form.tsx",
  "src/features/inquiries/presentation/components/customer-chat/customer-chat.tsx",
  "src/features/inquiries/presentation/clients/customer-message-client.ts",
  "src/features/inquiries/presentation/clients/customer-conversation-stream-client.ts",
  "src/features/inquiries/presentation/clients/conversation-typing-client.ts",
];
const serverBoundaryFiles = [
  "src/features/inquiries/infrastructure/http/inquiry-request-handler.ts",
  "src/features/inquiries/infrastructure/http/customer-conversation-cookie.ts",
  "src/features/inquiries/infrastructure/http/customer-conversation-request-handler.ts",
  "src/features/inquiries/infrastructure/http/customer-conversation-stream-request-handler.ts",
  "src/features/inquiries/infrastructure/http/customer-conversation-typing-request-handler.ts",
];

describe("Customer chat resume browser security boundary", () => {
  it("contains no raw capability format or persistent browser storage access", () => {
    for (const relativePath of browserFiles) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(/ypc_|localStorage|sessionStorage|indexedDB/iu);
    }
  });

  it("does not send the raw capability to an application logger", () => {
    for (const relativePath of serverBoundaryFiles) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(/\bconsole\.|\blogger\./u);
    }
  });
});
