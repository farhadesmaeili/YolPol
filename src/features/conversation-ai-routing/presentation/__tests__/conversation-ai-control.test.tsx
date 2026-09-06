import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";
import {ConversationAiControlPanel} from "@/features/conversation-ai-routing/presentation/components/conversation-ai-control";

const locales = {en, tr, fa, ar} as const;

describe("ConversationAiControlPanel", () => {
  it.each(Object.entries(locales))("renders localized, capability-gated controls for %s", (_locale, messages) => {
    const labels = messages.Staff.conversationAi;
    const html = renderToStaticMarkup(<ConversationAiControlPanel inquiryId="inquiry-1" initialStatus={{state: "AUTO", version: 0, latestJob: {status: "PENDING", decision: null, escalationReason: null, notBefore: "2026-09-02T10:00:00.000Z", updatedAt: "2026-09-02T09:00:00.000Z"}}} canControl labels={{...labels, states: labels.states, jobs: labels.jobs}} />);
    expect(html).toContain(labels.states.AUTO);
    expect(html).toContain(labels.jobs.PENDING);
    expect(html).toContain(labels.pause);
    expect(html).toContain(labels.takeover);
  });

  it("keeps controls read-only when capability is absent", () => {
    const labels = en.Staff.conversationAi;
    const html = renderToStaticMarkup(<ConversationAiControlPanel inquiryId="inquiry-1" initialStatus={{state: "HUMAN_TAKEOVER", version: 2, latestJob: null}} canControl={false} labels={{...labels, states: labels.states, jobs: labels.jobs}} />);
    expect(html).toContain(labels.states.HUMAN_TAKEOVER);
    expect(html).not.toContain("<button");
  });

  it.each(Object.entries(locales))("shows a localized Staff-review indicator for %s without exposing the internal reason code", (_locale, messages) => {
    const labels = messages.Staff.conversationAi;
    const html = renderToStaticMarkup(<ConversationAiControlPanel inquiryId="inquiry-1" initialStatus={{state: "AUTO", version: 0, latestJob: {status: "SUCCEEDED", decision: "ESCALATE", escalationReason: "PRICE_QUOTATION", notBefore: "2026-09-05T10:00:00.000Z", updatedAt: "2026-09-05T10:00:01.000Z"}}} canControl={false} labels={{...labels, states: labels.states, jobs: labels.jobs}} />);
    expect(html).toContain(labels.escalated);
    expect(html).not.toContain("PRICE_QUOTATION");
  });
});
