import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

async function filesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesRecursively(join(directory, entry.name))
    : [join(directory, entry.name)]));
  return nested.flat();
}

describe("Staff invitation presentation security", () => {
  it("has invitation redemption but no public Staff registration or signup route", async () => {
    const staffApp = join(process.cwd(), "src", "app");
    const routes = (await filesRecursively(staffApp)).map((file) => file.replaceAll("\\", "/").toLowerCase());
    expect(routes.some((file) => file.includes("/staff/activate/") && file.endsWith("/page.tsx"))).toBe(true);
    expect(routes.some((file) => /\/staff\/(?:register|signup)\//u.test(file))).toBe(false);
    expect(routes.some((file) => /\/api\/staff\/(?:register|signup)\//u.test(file))).toBe(false);
  });

  it("does not persist or log activation codes in Staff browser surfaces", async () => {
    const presentation = join(process.cwd(), "src", "features", "staff-authentication", "presentation");
    const relevantFiles = (await filesRecursively(presentation)).filter((file) => /staff-(?:activation|management)/u.test(file) && !file.includes(`${join("presentation", "__tests__")}`));
    const source = (await Promise.all(relevantFiles.map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/iu);
    expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug)/u);
    expect(source).not.toMatch(/dangerouslySetInnerHTML/u);
  });

  it("keeps invitation and provider secrets out of safe Team DTOs", async () => {
    const dto = await readFile(join(process.cwd(), "src", "features", "staff-authentication", "application", "dto", "staff-management-dto.ts"), "utf8");
    expect(dto).not.toMatch(/tokenLookup|tokenVerification|activationCode|passwordHash|session|externalId|chatId/iu);
    expect(dto).toContain("telegramLinked: boolean");
  });
});
