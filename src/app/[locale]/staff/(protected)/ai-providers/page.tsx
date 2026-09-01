import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getAiProviderRegistry} from "@/composition/ai-provider-registry/ai-provider-registry";
import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {AiProviderRegistryPanel} from "@/features/ai-provider-registry/presentation/components/ai-provider-registry-panel";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type Props = Readonly<{params: Promise<{locale: string}>}>;
export async function generateMetadata({params}: Props): Promise<Metadata> { const {locale} = await params; if (!isLocale(locale)) notFound(); return {title: (await getTranslations({locale, namespace: "AiProviderRegistry"}))("metadata")}; }

export default async function AiProvidersPage({params}: Props) {
  const {locale} = await params; if (!isLocale(locale)) notFound(); setRequestLocale(locale);
  const access = await resolveStaffPanelAccess(); if (access.status !== "authorized") return null;
  const feature = getAiProviderRegistry(); const [registry, audit] = await Promise.all([feature.getRegistry.execute(access.principal), feature.readAuditHistory.execute(access.principal)]);
  const staffT = await getTranslations({locale, namespace: "Staff"});
  if (registry.status === "forbidden" || audit.status === "forbidden") return <StaffState title={staffT("states.forbiddenTitle")} description={staffT("states.forbiddenDescription")} />;
  if (registry.status !== "found" || audit.status !== "found") return <StaffState title={staffT("states.serviceUnavailableTitle")} description={staffT("states.serviceUnavailableDescription")} />;
  const t = await getTranslations({locale, namespace: "AiProviderRegistry"});
  return <AiProviderRegistryPanel locale={locale} registry={registry.registry} events={audit.events} mayManageProviders={access.capabilities.mayManageAiProviders} mayManageCredentialReferences={access.capabilities.mayManageAiCredentialReferences} labels={{
    eyebrow: t("eyebrow"), title: t("title"), description: t("description"), providers: t("providers"), profiles: t("profiles"), credentials: t("credentials"), audit: t("audit"), empty: t("empty"), readOnly: t("readOnly"),
    id: t("id"), adapterKey: t("adapterKey"), displayName: t("displayName"), name: t("name"), modelIdentifier: t("modelIdentifier"), provider: t("provider"), alias: t("alias"), secretReference: t("secretReference"), secretReferenceHelp: t("secretReferenceHelp"), enabled: t("enabled"), priority: t("priority"), capabilities: t("capabilities"), temperature: t("temperature"), topP: t("topP"), maxOutputTokens: t("maxOutputTokens"), version: t("version"), updatedAt: t("updatedAt"), updatedBy: t("updatedBy"),
    createProvider: t("createProvider"), createProfile: t("createProfile"), createCredential: t("createCredential"), save: t("save"), saving: t("saving"), saved: t("saved"), edit: t("edit"), statuses: {enabled: t("statuses.enabled"), disabled: t("statuses.disabled")},
    errors: {conflict: t("errors.conflict"), invalid: t("errors.invalid"), forbidden: t("errors.forbidden"), rate_limited: t("errors.rate_limited"), failed: t("errors.failed")},
    eventTypes: {CREATED: t("eventTypes.CREATED"), UPDATED: t("eventTypes.UPDATED"), ENABLED: t("eventTypes.ENABLED"), DISABLED: t("eventTypes.DISABLED")}, entityTypes: {PROVIDER: t("entityTypes.PROVIDER"), MODEL_PROFILE: t("entityTypes.MODEL_PROFILE"), CREDENTIAL_REFERENCE: t("entityTypes.CREDENTIAL_REFERENCE")},
    capabilityLabels: {TEXT_GENERATION: t("capabilityLabels.TEXT_GENERATION"), TRANSLATION: t("capabilityLabels.TRANSLATION"), STRUCTURED_OUTPUT: t("capabilityLabels.STRUCTURED_OUTPUT"), TOOL_CALLING: t("capabilityLabels.TOOL_CALLING")},
  }} />;
}
