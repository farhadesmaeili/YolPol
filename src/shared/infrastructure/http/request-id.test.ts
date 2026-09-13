import {describe, expect, it, vi} from "vitest";

import {isSafeRequestId, maximumRequestIdLength, resolveRequestId} from "@/shared/infrastructure/http/request-id";

describe("HTTP request IDs", () => {
  it.each(["request-123", "550e8400-e29b-41d4-a716-446655440000", "edge:region_1.2"])(
    "preserves a safe bounded inbound ID: %s",
    (value) => {
      const generate = vi.fn(() => "generated-id");
      expect(resolveRequestId(value, generate)).toBe(value);
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it.each(["", " leading", "contains space", "line\nbreak", "tab\tvalue", `x${"y".repeat(maximumRequestIdLength)}`])(
    "replaces an unsafe inbound ID",
    (value) => {
      expect(isSafeRequestId(value)).toBe(false);
      expect(resolveRequestId(value, () => "generated-id")).toBe("generated-id");
    },
  );
});
