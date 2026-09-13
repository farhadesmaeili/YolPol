import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const routeSource = readFileSync("src/app/[locale]/wholesale-process/page.tsx", "utf8");
const presentationSource = readFileSync(
  "src/features/export-logistics/presentation/components/export-logistics-page.tsx",
  "utf8",
);

describe("Wholesale Process public route", () => {
  it("remains static and maps the complete ten-step localized workflow", () => {
    expect(routeSource).toContain('export const dynamic = "force-static"');
    expect(routeSource).toContain("Array.from({length: 10}");
    expect(routeSource).toContain('pathname: "/wholesale-process"');
    expect(routeSource).not.toContain('pathname: "/export-logistics"');
  });

  it("uses Inquiry as its primary commercial destination", () => {
    expect(presentationSource).toContain('href="/inquiry"');
    expect(presentationSource).not.toContain('href="/contact"');
  });
});
