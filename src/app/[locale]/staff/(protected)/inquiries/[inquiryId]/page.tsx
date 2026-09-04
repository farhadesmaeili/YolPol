import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getStaffPanelTeamOperations, resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffInquiryDetail} from "@/features/inquiries/presentation/components/staff/staff-inquiry-detail";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";
import {getConversationAiRouting} from "@/composition/conversation-ai-routing/conversation-ai-routing";

type StaffInquiryDetailPageProps = Readonly<{params: Promise<{locale: string; inquiryId: string}>}>;

export async function generateMetadata({params}: StaffInquiryDetailPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "Staff"}))("metadata.inquiryDetail")};
}

export default async function StaffInquiryDetailPage({params}: StaffInquiryDetailPageProps) {
  const {locale, inquiryId} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const operations = getStaffPanelTeamOperations();
  const [result, teamMembersResult, conversationAiResult] = await Promise.all([
    operations.getInquiryDetail.execute({inquiryId}),
    operations.listAssignableTeamMembers.execute(),
    getConversationAiRouting().getStatus.execute({inquiryId, principal: access.principal}),
  ]);
  if (result.status === "inquiry_not_found" || result.status === "validation_failed") notFound();
  if (result.status !== "found") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  }
  if (conversationAiResult.status !== "found") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  }
  const teamMemberNames = Object.freeze(Object.fromEntries([
    ...(teamMembersResult.status === "found"
      ? teamMembersResult.teamMembers.map(({id, displayName}) => [id, displayName] as const)
      : []),
    [access.principal.teamMemberId, access.principal.displayName] as const,
  ]));
  return <StaffInquiryDetail detail={result.detail} locale={locale} teamMemberNames={teamMemberNames} canReply={access.capabilities.mayReplyToCustomerConversation} conversationAiStatus={conversationAiResult.value} canControlConversationAi={access.capabilities.mayControlConversationAi} />;
}
