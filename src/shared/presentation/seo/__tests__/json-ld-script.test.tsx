import {describe, expect, it} from "vitest";

import {
  JsonLdScript,
  serializeJsonLd,
} from "@/shared/presentation/seo/json-ld-script";

describe("shared JSON-LD rendering", () => {
  it("serializes valid JSON while escaping less-than characters", () => {
    const serialized = serializeJsonLd({name: "</script><script>", count: 2});

    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized)).toEqual({name: "</script><script>", count: 2});
  });

  it("renders the application/ld+json script contract", () => {
    const element = JsonLdScript({data: {"@type": "BreadcrumbList"}});

    expect(element).toMatchObject({
      type: "script",
      props: {
        type: "application/ld+json",
        dangerouslySetInnerHTML: {
          __html: '{"@type":"BreadcrumbList"}',
        },
      },
    });
  });
});
