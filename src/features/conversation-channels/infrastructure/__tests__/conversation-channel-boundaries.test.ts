import {readFileSync, readdirSync} from "node:fs";
import {join, sep} from "node:path";
import {describe, expect, it} from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("Conversation Channel architecture and security boundaries", () => {
  const production = files("src/features/conversation-channels");
  const domainAndApplication = production.filter((path) => path.split(sep).some((part) => part === "domain" || part === "application"));

  it("keeps provider SDK and infrastructure types out of domain/application", () => {
    expect(domainAndApplication.length).toBeGreaterThan(0);
    const source = domainAndApplication.map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();
    for (const forbidden of ["groq-sdk", "telegram bot api", "instagram graph", "smtp", "nodemailer", "drizzle-orm", "node:crypto", "pg\""]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("has no raw provider payload, secret, metadata bag, attachment, or pricing field", () => {
    const source = production.map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();
    for (const forbidden of ["raw_payload", "webhook_payload", "provider_token", "access_token", "api_key", "metadata: json", "attachment_url", "internalunitprice", "supplier_cost", "margin"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
