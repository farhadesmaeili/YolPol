import {getTranslations} from "next-intl/server";
import {locale as getRootLocale} from "next/root-params";

import {Link} from "@/i18n/navigation";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";

export default async function StaffInquiryNotFound() {
  const locale = await getRootLocale();
  const t = await getTranslations({locale, namespace: "Staff"});
  return <StaffState title={t("states.notFoundTitle")} description={t("states.notFoundDescription")} action={<Link href="/staff/inquiries" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("inquiryDetail.back")}</Link>} />;
}
