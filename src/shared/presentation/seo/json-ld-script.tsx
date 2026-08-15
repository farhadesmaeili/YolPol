import type {ReactNode} from "react";

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function JsonLdScript({data}: {data: unknown}): ReactNode {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{__html: serializeJsonLd(data)}}
    />
  );
}
