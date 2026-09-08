import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {getConversationTranslationControl} from "@/composition/conversation-translation/conversation-translation-control";
import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {GlobalTranslationSettingsPanel} from "@/features/conversation-translation/presentation/components/global-translation-settings-panel";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type TranslationSettingsPageProps = Readonly<{params: Promise<{locale: string}>}>;

export async function generateMetadata({params}: TranslationSettingsPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "TranslationSettings"}))("metadata")};
}

export default async function TranslationSettingsPage({params}: TranslationSettingsPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const result = await getConversationTranslationControl().getGlobalDefaults.execute(access.principal);
  const staffT = await getTranslations({locale, namespace: "Staff"});
  if (result.status === "forbidden") return <StaffState title={staffT("states.forbiddenTitle")} description={staffT("states.forbiddenDescription")} />;
  if (result.status !== "found") return <StaffState title={staffT("states.serviceUnavailableTitle")} description={staffT("states.serviceUnavailableDescription")} />;
  const t = await getTranslations({locale, namespace: "TranslationSettings"});
  return <GlobalTranslationSettingsPanel key={result.value.version} initialDefaults={result.value} mayManage={access.capabilities.mayManageTranslationSettings} labels={{
    eyebrow: t("eyebrow"), title: t("title"), description: t("description"), inherited: t("inherited"),
    customerToStaff: t("customerToStaff"), customerToStaffDescription: t("customerToStaffDescription"),
    staffToCustomer: t("staffToCustomer"), staffToCustomerDescription: t("staffToCustomerDescription"),
    aiToStaff: t("aiToStaff"), aiToStaffDescription: t("aiToStaffDescription"), safetyTitle: t("safetyTitle"), safety: t("safety"),
    auto: t("auto"), manual: t("manual"), onDemand: t("onDemand"), save: t("save"), saving: t("saving"), saved: t("saved"),
    error: t("error"), readOnly: t("readOnly"),
  }} />;
}
