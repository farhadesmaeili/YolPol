import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {CustomerChat} from "@/features/inquiries/presentation/components/customer-chat/customer-chat";
import {MessageList} from "@/features/inquiries/presentation/components/customer-chat/message-list";
import type {CustomerChatLabels} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";

const labels: CustomerChatLabels = enMessages.CustomerChat;

describe("Customer chat presentation", () => {
  it("renders an accessible responsive chat foundation without exposing the inquiry path", () => {
    const html = renderToStaticMarkup(<CustomerChat inquiryId="inquiry_private_1" labels={labels} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('name="message"');
    expect(html).toContain('required=""');
    expect(html).toContain(labels.loadingHistory);
    expect(html).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(html).not.toContain("inquiry_private_1");
  });

  it("renders loaded customer and support history at logical ends", () => {
    const html = renderToStaticMarkup(<MessageList messages={[{id: "1", body: "Customer message", sender: "customer"}, {id: "2", body: "Support reply", sender: "support"}]} label="Messages" empty="Empty" customerAuthor="You" supportAuthor="YolPol" />);
    expect(html).toContain("justify-end");
    expect(html).toContain("justify-start");
    expect(html).toContain("Customer message");
    expect(html).toContain("Support reply");
  });

  it.each([
    ["en", enMessages.CustomerChat],
    ["tr", trMessages.CustomerChat],
    ["fa", faMessages.CustomerChat],
    ["ar", arMessages.CustomerChat],
  ] as const)("provides the complete %s chat catalog", (_locale, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(enMessages.CustomerChat).sort());
    expect(Object.keys(catalog.errors).sort()).toEqual(Object.keys(enMessages.CustomerChat.errors).sort());
    expect(Object.values(catalog).every((value) => typeof value === "object" || value.length > 0)).toBe(true);
  });
});
