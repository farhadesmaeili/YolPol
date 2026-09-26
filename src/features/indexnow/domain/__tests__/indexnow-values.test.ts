import {describe, expect, it} from "vitest";

import {parseIndexNowKey} from "@/features/indexnow/domain/value-objects/indexnow-key";
import {parseCanonicalIndexNowUrl} from "@/features/indexnow/domain/value-objects/indexnow-url";

describe("IndexNow protocol values", () => {
  it("accepts only 8-128 character alphanumeric or hyphen keys", () => {
    expect(parseIndexNowKey("synthetic-key-123")).toBe("synthetic-key-123");
    expect(() => parseIndexNowKey("short-1")).toThrow("Invalid IndexNow key.");
    expect(() => parseIndexNowKey("a".repeat(129))).toThrow("Invalid IndexNow key.");
    expect(() => parseIndexNowKey("invalid_key")).toThrow("Invalid IndexNow key.");
    expect(() => parseIndexNowKey("")).toThrow("Invalid IndexNow key.");
  });

  it("accepts only exact canonical HTTPS URLs without credentials or fragments", () => {
    expect(parseCanonicalIndexNowUrl("https://yolpol.com/fa/products", "https://yolpol.com"))
      .toBe("https://yolpol.com/fa/products");
    for (const value of [
      "http://yolpol.com/en",
      "https://www.yolpol.com/en",
      "https://user@yolpol.com/en",
      "https://yolpol.com/en#fragment",
      "https://yolpol.com/a path",
      "not-a-url",
    ]) {
      expect(() => parseCanonicalIndexNowUrl(value, "https://yolpol.com")).toThrow(
        "Invalid canonical IndexNow URL.",
      );
    }
  });
});
