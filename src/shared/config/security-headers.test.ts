import {describe, expect, it} from "vitest";

import {baselineSecurityHeaders} from "../../../next.config";

describe("baseline response security headers", () => {
  it("sets conservative global headers without prematurely enabling HSTS or CSP", () => {
    expect(Object.fromEntries(baselineSecurityHeaders.map(({key, value}) => [key, value]))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "X-Frame-Options": "DENY",
    });
    expect(baselineSecurityHeaders.some(({key}) => key === "Strict-Transport-Security")).toBe(false);
    expect(baselineSecurityHeaders.some(({key}) => key === "Content-Security-Policy")).toBe(false);
  });
});
