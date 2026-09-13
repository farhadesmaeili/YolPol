import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const example = readFileSync(resolve(".env.example"), "utf8");
const assignments = example
  .split(/\r?\n/u)
  .filter((line) => /^[A-Z][A-Z0-9_]*=/u.test(line))
  .map((line) => line.slice(0, line.indexOf("=")));
const rateLimitSources = [
  "src/features/inquiries/infrastructure/http/inquiry-rate-limiter.ts",
  "src/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter.ts",
  "src/features/inquiries/infrastructure/http/conversation-typing-rate-limiter.ts",
  "src/features/staff-authentication/infrastructure/http/staff-login-rate-limiter.ts",
  "src/features/ai-operations/infrastructure/http/ai-operations-rate-limiter.ts",
  "src/features/ai-provider-registry/infrastructure/http/ai-provider-registry-rate-limiter.ts",
] as const;

function consumedRateLimitVariables(): string[] {
  const names = rateLimitSources.flatMap((path) => [
    ...readFileSync(resolve(path), "utf8").matchAll(/\b[A-Z][A-Z0-9_]*_RATE_LIMIT_[A-Z0-9_]+\b/gu),
  ].map((match) => match[0]));
  return [...new Set(names)].sort();
}

describe("environment example contract", () => {
  it("contains each environment variable at most once", () => {
    expect(assignments).toHaveLength(new Set(assignments).size);
  });

  it("documents every rate-limit variable consumed by runtime composition", () => {
    expect(assignments.filter((name) => name.includes("_RATE_LIMIT_")).sort()).toEqual(consumedRateLimitVariables());
  });

  it("exposes only the public Telegram username to browser bundles", () => {
    expect(assignments.filter((name) => name.startsWith("NEXT_PUBLIC_"))).toEqual([
      "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME",
    ]);
  });

  it("documents direct and file-backed forms for supported runtime secrets", () => {
    expect(assignments).toEqual(expect.arrayContaining([
      "GROQ_API_KEY",
      "GROQ_API_KEY_FILE",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_BOT_TOKEN_FILE",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_WEBHOOK_SECRET_FILE",
    ]));
  });
});
