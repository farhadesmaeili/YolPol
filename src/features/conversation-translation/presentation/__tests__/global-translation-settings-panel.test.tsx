import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {GlobalTranslationSettingsPanel} from "@/features/conversation-translation/presentation/components/global-translation-settings-panel";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";

vi.mock("@/i18n/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

describe("GlobalTranslationSettingsPanel", () => {
  it.each([en, fa])("shows all defaults and the non-configurable safety invariant", (messages) => {
    const labels = messages.TranslationSettings;
    const html = renderToStaticMarkup(<GlobalTranslationSettingsPanel initialDefaults={{customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 0}} mayManage labels={labels} />);
    expect(html).toContain(labels.customerToStaff);
    expect(html).toContain(labels.staffToCustomer);
    expect(html).toContain(labels.aiToStaff);
    expect(html).toContain(labels.safety);
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("provider");
  });

  it("renders a truthful read-only surface for non-administrators", () => {
    const html = renderToStaticMarkup(<GlobalTranslationSettingsPanel initialDefaults={{customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 0}} mayManage={false} labels={en.TranslationSettings} />);
    expect(html).toContain(en.TranslationSettings.readOnly);
    expect(html).not.toContain(en.TranslationSettings.save);
  });
});
