import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {listInquiryProductOptions} from "@/composition/inquiries/inquiry-presentation";
import {InquiryProductPicker} from "@/features/inquiries/presentation/components/inquiry-product-picker";
import {customerFollowUpMessages, InquirySummary} from "@/features/inquiries/presentation/components/customer-chat/inquiry-summary";
import {MessageItem} from "@/features/inquiries/presentation/components/customer-chat/message-item";
import {shouldSendCustomerMessageOnEnter} from "@/features/inquiries/presentation/components/customer-chat/message-input";
import {parseCustomerInquirySummary} from "@/features/inquiries/presentation/clients/customer-inquiry-summary-client";
import {createInitialInquiryFormState, inquiryFormReducer} from "@/features/inquiries/presentation/state/inquiry-form-reducer";
import type {CustomerInquirySummaryDto} from "@/features/inquiries/application/dto/customer-inquiry-summary-dto";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";

const summary: CustomerInquirySummaryDto = {createdAt: "2026-09-07T10:00:00.000Z", items: [{productId: "test-product", name: "Requested bottle", quantity: 27, unit: "packages"}], destination: {country: "TR", city: "Istanbul"}, details: "Please confirm timing", initialMessageId: "inquiry-initial"};

describe("Inquiry and chat redesign", () => {
  it("keeps mobile Enter, Shift+Enter and IME composition as text input", () => {
    const enter = {key: "Enter", shiftKey: false, nativeEvent: {isComposing: false, keyCode: 13}};
    expect(shouldSendCustomerMessageOnEnter(enter, true)).toBe(true);
    expect(shouldSendCustomerMessageOnEnter(enter, false)).toBe(false);
    expect(shouldSendCustomerMessageOnEnter({...enter, shiftKey: true}, true)).toBe(false);
    expect(shouldSendCustomerMessageOnEnter({...enter, nativeEvent: {isComposing: true, keyCode: 13}}, true)).toBe(false);
    expect(shouldSendCustomerMessageOnEnter({...enter, nativeEvent: {isComposing: false, keyCode: 229}}, true)).toBe(false);
  });
  it("uses the existing add/remove actions to drive accessible selected state", async () => {
    const products = await listInquiryProductOptions("en");
    let state = createInitialInquiryFormState(true);
    state = inquiryFormReducer(state, {type: "select_pending_product", productId: products[0].id});
    state = inquiryFormReducer(state, {type: "add_product", availableIds: products.map(({id}) => id)});
    const render = () => renderToStaticMarkup(<InquiryProductPicker products={products} selectedIds={state.lines.map(({productId}) => productId)} addLabel="Add" removeLabel="Remove" onToggle={() => {}} />);
    expect(render().match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(render()).toContain("Remove:");
    state = inquiryFormReducer(state, {type: "remove_product", productId: products[0].id});
    expect(state.lines).toHaveLength(0); expect(render()).not.toContain('aria-pressed="true"');
    expect(products.some(({image}) => image?.source.startsWith("/"))).toBe(true);
    expect(JSON.stringify(products)).not.toMatch(/internalUnitPrice|margin|supplier|cost|amount/i);
  });
  it("hides only the server-identified initial Customer note, including after history merge", () => {
    const messages = [{id: "inquiry-initial", body: "Please confirm timing", sender: "customer" as const}, {id: "follow-up", body: "Please confirm timing", sender: "customer" as const}];
    expect(customerFollowUpMessages(messages, summary).map(({id}) => id)).toEqual(["follow-up"]);
    expect(customerFollowUpMessages(messages, null)).toEqual(messages);
    expect(customerFollowUpMessages(messages, {...summary, details: null})).toEqual(messages);
    expect(customerFollowUpMessages([{...messages[0], sender: "support"}], summary)).toHaveLength(1);
    expect(messages).toHaveLength(2);
  });
  it.each([["en", en], ["ar", ar], ["fa", fa], ["tr", tr]] as const)("renders safe %s summary and preserves exact quantities", (locale, catalog) => {
    const html = renderToStaticMarkup(<InquirySummary summary={summary} labels={catalog.CustomerChat.summary} locale={locale} products={[]} countries={catalog.InquiryPage.countries} />);
    expect(html).toContain("<summary"); expect(html).toContain("Requested bottle");
    expect(html).toContain(new Intl.NumberFormat(locale).format(27));
    expect(html).toContain(catalog.CustomerChat.summary.units.packages);
    expect(html).not.toMatch(/inquiry-initial|test-product|INTERNAL_USER|AI_AGENT/);
    expect(Object.keys(catalog.CustomerChat.summary)).toEqual(Object.keys(en.CustomerChat.summary));
    for (const key of ["contactHint", "destinationHint", "detailsHint", "continueHint", "newInquiry"] as const) expect(catalog.InquiryPage.form[key].length).toBeGreaterThan(5);
  });
  it("renders authored mixed-direction text safely with a real timestamp", () => {
    const html = renderToStaticMarkup(<MessageItem message={{id: "safe-message", body: "<script>alert(1)</script> رابط https://example.test", sender: "support", createdAt: summary.createdAt}} author="YOLPOL" locale="ar" />);
    expect(html).toContain('dir="auto"'); expect(html).toContain("&lt;script&gt;"); expect(html).toContain(`<time dateTime="${summary.createdAt}"`);
  });
  it("validates summaries and never carries extra internal fields into presentation", () => {
    expect(parseCustomerInquirySummary({...summary, internalPrice: 999})).toEqual(summary);
    expect(parseCustomerInquirySummary({...summary, items: [{...summary.items[0], quantity: 1.5}]})).toBeNull();
    expect(parseCustomerInquirySummary({...summary, items: [{...summary.items[0], unit: "invalid"}]})).toBeNull();
    expect(parseCustomerInquirySummary({...summary, createdAt: "invalid"})).toBeNull();
  });
});
