import {describe, expect, it, vi} from "vitest";

import {
  FileIndexNowKeyProvider,
  InvalidIndexNowKeyConfigurationError,
} from "@/features/indexnow/infrastructure/config/file-indexnow-key-provider";

describe("file-backed IndexNow key provider", () => {
  it("reads a valid key and removes only safe surrounding whitespace", async () => {
    const read = vi.fn(async () => "\r\n synthetic-key-123 \t");
    await expect(new FileIndexNowKeyProvider({INDEXNOW_KEY_FILE: " /run/secrets/indexnow_key "}, read).readKey())
      .resolves.toBe("synthetic-key-123");
    expect(read).toHaveBeenCalledWith("/run/secrets/indexnow_key");
  });

  it.each([
    ["too short", "short-1"],
    ["too long", "a".repeat(129)],
    ["invalid character", "invalid_key"],
    ["empty", " \n"],
    ["unsafe surrounding whitespace", "\u00a0synthetic-key-123\u00a0"],
  ])("rejects %s content without exposing it or the path", async (_name, content) => {
    const failure = await new FileIndexNowKeyProvider(
      {INDEXNOW_KEY_FILE: "/sensitive/key/path"},
      vi.fn(async () => content),
    ).readKey().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InvalidIndexNowKeyConfigurationError);
    expect(String(failure)).not.toContain(content);
    expect(String(failure)).not.toContain("/sensitive/key/path");
  });

  it("fails safely for missing and unreadable files", async () => {
    await expect(new FileIndexNowKeyProvider({}, vi.fn()).readKey())
      .rejects.toBeInstanceOf(InvalidIndexNowKeyConfigurationError);
    const failure = await new FileIndexNowKeyProvider(
      {INDEXNOW_KEY_FILE: "/sensitive/key/path"},
      vi.fn(async () => { throw new Error("filesystem detail"); }),
    ).readKey().catch((error: unknown) => error);
    expect(String(failure)).not.toMatch(/filesystem detail|sensitive\/key/u);
  });
});
