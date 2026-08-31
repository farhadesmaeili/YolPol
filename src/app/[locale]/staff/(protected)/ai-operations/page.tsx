import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getAiOperations} from "@/composition/ai-operations/ai-operations";
import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {AiOperationsControlPanel} from "@/features/ai-operations/presentation/components/ai-operations-control-panel";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type AiOperationsPageProps = Readonly<{params: Promise<{locale: string}>}>;

export async function generateMetadata({params}: AiOperationsPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "AiOperations"}))("metadata")};
}

export default async function AiOperationsPage({params}: AiOperationsPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const operations = getAiOperations();
  const [policyResult, auditResult] = await Promise.all([
    operations.getPolicy.execute(access.principal),
    operations.readAuditHistory.execute(access.principal),
  ]);
  const staffT = await getTranslations({locale, namespace: "Staff"});
  if (policyResult.status === "forbidden" || auditResult.status === "forbidden") {
    return <StaffState title={staffT("states.forbiddenTitle")} description={staffT("states.forbiddenDescription")} />;
  }
  if (policyResult.status !== "found" || auditResult.status !== "found") {
    return <StaffState title={staffT("states.serviceUnavailableTitle")} description={staffT("states.serviceUnavailableDescription")} />;
  }
  const t = await getTranslations({locale, namespace: "AiOperations"});
  return <AiOperationsControlPanel
    locale={locale}
    status={policyResult.value}
    events={auditResult.events}
    mayManage={access.capabilities.mayManageAiOperations}
    labels={{
      eyebrow: t("eyebrow"), title: t("title"), description: t("description"), configuredState: t("configuredState"), effectiveState: t("effectiveState"), effectiveAllowed: t("effectiveAllowed"), effectiveBlocked: t("effectiveBlocked"), eligibilityNotice: t("eligibilityNotice"), noPolicy: t("noPolicy"), emergencyOverride: t("emergencyOverride"),
      emergencyStates: {INACTIVE: t("emergencyStates.INACTIVE"), ACTIVE: t("emergencyStates.ACTIVE"), INVALID: t("emergencyStates.INVALID")},
      decisionReasons: {POLICY_DISABLED: t("decisionReasons.POLICY_DISABLED"), OUTSIDE_SCHEDULE: t("decisionReasons.OUTSIDE_SCHEDULE"), EMERGENCY_DISABLED: t("decisionReasons.EMERGENCY_DISABLED"), POLICY_UNAVAILABLE: t("decisionReasons.POLICY_UNAVAILABLE"), POLICY_INVALID: t("decisionReasons.POLICY_INVALID"), ALLOWED_FALLBACK: t("decisionReasons.ALLOWED_FALLBACK"), ALLOWED_SCHEDULE: t("decisionReasons.ALLOWED_SCHEDULE")},
      mode: t("mode"), modes: {DISABLED: t("modes.DISABLED"), FALLBACK: t("modes.FALLBACK"), SCHEDULED: t("modes.SCHEDULED")}, businessTimeZone: t("businessTimeZone"), gracePeriodMinutes: t("gracePeriodMinutes"), schedule: t("schedule"), scheduleDescription: t("scheduleDescription"), weekday: t("weekday"),
      weekdays: {MONDAY: t("weekdays.MONDAY"), TUESDAY: t("weekdays.TUESDAY"), WEDNESDAY: t("weekdays.WEDNESDAY"), THURSDAY: t("weekdays.THURSDAY"), FRIDAY: t("weekdays.FRIDAY"), SATURDAY: t("weekdays.SATURDAY"), SUNDAY: t("weekdays.SUNDAY")},
      start: t("start"), end: t("end"), enabled: t("enabled"), addWindow: t("addWindow"), removeWindow: t("removeWindow"), version: t("version"), updatedAt: t("updatedAt"), updatedBy: t("updatedBy"), notAvailable: t("notAvailable"), confirmEligibility: t("confirmEligibility"), save: t("save"), disableImmediately: t("disableImmediately"), saving: t("saving"), saved: t("saved"),
      errors: {invalid: t("errors.invalid"), conflict: t("errors.conflict"), forbidden: t("errors.forbidden"), rate_limited: t("errors.rate_limited"), failed: t("errors.failed"), confirmation: t("errors.confirmation")},
      readOnly: t("readOnly"), auditTitle: t("auditTitle"), auditDescription: t("auditDescription"), auditEmpty: t("auditEmpty"), eventTypes: {POLICY_CREATED: t("eventTypes.POLICY_CREATED"), POLICY_UPDATED: t("eventTypes.POLICY_UPDATED")}, previousVersion: t("previousVersion"), newVersion: t("newVersion"),
    }}
  />;
}
