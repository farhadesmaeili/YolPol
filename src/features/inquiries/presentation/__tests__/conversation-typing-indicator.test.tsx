import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ConversationTypingIndicator} from "@/features/inquiries/presentation/components/conversation-typing-indicator";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";

describe("ConversationTypingIndicator", () => {
  it.each([
    ["en", enMessages.ConversationTyping.team],
    ["tr", trMessages.ConversationTyping.team],
    ["fa", faMessages.ConversationTyping.team],
    ["ar", arMessages.ConversationTyping.team],
  ])("renders an accessible, mobile-safe, reduced-motion %s indicator", (_locale, label) => {
    const html = renderToStaticMarkup(<ConversationTypingIndicator active label={label} />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain(label);
    expect(html).toContain("min-w-0");
    expect(html).toContain("break-words");
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("reserves subtle space while inactive without announcing a status", () => {
    const html = renderToStaticMarkup(<ConversationTypingIndicator active={false} label="Customer is typing…" />);
    expect(html).toContain("min-h-7");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("Customer is typing");
  });
});
