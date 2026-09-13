import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {TranslationControlPanel} from "@/features/conversation-translation/presentation/components/translation-control-panel";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";
import fa from "@/i18n/messages/fa.json";
import ar from "@/i18n/messages/ar.json";

vi.mock("@/i18n/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

describe("TranslationControlPanel", () => {
  it.each([en, tr, fa, ar])("renders all three localized durable modes accessibly", (messages) => {
    const labels = messages.Staff.translationControl;
    const html = renderToStaticMarkup(<TranslationControlPanel inquiryId="inquiry" initialControl={{
      globalDefaults: {customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 1},
      override: {customerToStaffMode: "MANUAL", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 2},
      effective: {customerToStaffMode: "MANUAL", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND"}, source: "OVERRIDE",
    }} canControl labels={labels} />);
    expect(html).toContain(labels.customerToStaff);
    expect(html).toContain(labels.staffToCustomer);
    expect(html).toContain(labels.aiToStaff);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(labels.onDemand);
  });

  it("keeps Viewer controls disabled while showing active durable state", () => {
    const html = renderToStaticMarkup(<TranslationControlPanel inquiryId="inquiry" initialControl={{
      globalDefaults: {customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 0},
      override: null, effective: {customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND"}, source: "GLOBAL",
    }} canControl={false} labels={en.Staff.translationControl} />);
    expect(html).toContain(en.Staff.translationControl.usingGlobal);
    expect(html).not.toContain("<button");
    expect(html).toContain(en.Staff.translationControl.auto);
  });
});
