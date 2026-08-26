import {getTranslations} from "next-intl/server";

import type {TeamInquiryDetailDto} from "@/features/inquiries/application/dto/team-operations-dto";
import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import {StaffDateTime, StaffPageHeader, StaffPanel, StaffState, StaffStatusBadge} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {Link} from "@/i18n/navigation";
import {formatHumanNumber, LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

function isStatus(value: string | null): value is InquiryStatus {
  return value === "NEW" || value === "WAITING_FOR_TEAM" || value === "WAITING_FOR_CUSTOMER" || value === "QUOTED" || value === "CONFIRMED" || value === "CLOSED";
}

function DetailValue({children, label, ltr = false}: Readonly<{children: React.ReactNode; label: string; ltr?: boolean}>) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-stone-500">{label}</dt><dd className={`mt-1 break-words text-sm font-semibold text-stone-900 ${ltr ? "font-mono text-xs" : ""}`}>{ltr ? <LtrIsolate>{children}</LtrIsolate> : children}</dd></div>;
}

export async function StaffInquiryDetail({detail, locale}: Readonly<{detail: TeamInquiryDetailDto; locale: Locale}>) {
  const t = await getTranslations({locale, namespace: "Staff"});
  const inquiry = detail.inquiry;
  const valueArrow = locale === "fa" || locale === "ar" ? "←" : "→";
  const valueLabel = (value: string | null) => value === null
    ? t("common.none")
    : isStatus(value)
      ? t(`statuses.${value}`)
      : value;

  return (
    <>
      <StaffPageHeader
        eyebrow={t("inquiryDetail.eyebrow")}
        title={t("inquiryDetail.title")}
        description={t("inquiryDetail.description")}
        action={<Link href="/staff/inquiries" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("inquiryDetail.back")}</Link>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="space-y-4">
          <StaffPanel title={t("inquiryDetail.overview")}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><StaffStatusBadge status={inquiry.status} label={t(`statuses.${inquiry.status}`)} /><span className="text-xs text-stone-500">{t("common.utc")}</span></div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailValue label={t("common.inquiryId")} ltr>{inquiry.id}</DetailValue>
              <DetailValue label={t("common.assignment")}>{detail.assignment?.displayName ?? t("common.unassigned")}</DetailValue>
              <DetailValue label={t("common.created")}><StaffDateTime locale={locale} value={inquiry.createdAt} /></DetailValue>
              <DetailValue label={t("common.updated")}><StaffDateTime locale={locale} value={inquiry.updatedAt} /></DetailValue>
              {detail.assignment ? <><DetailValue label={t("common.teamMemberId")} ltr>{detail.assignment.teamMemberId}</DetailValue><DetailValue label={t("common.assignedAt")}><StaffDateTime locale={locale} value={detail.assignment.assignedAt} /></DetailValue></> : null}
            </dl>
          </StaffPanel>

          <StaffPanel title={t("inquiryDetail.customer")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailValue label={t("common.fullName")}>{inquiry.contact.fullName}</DetailValue>
              <DetailValue label={t("common.company")}>{inquiry.contact.company ?? t("common.notProvided")}</DetailValue>
              <DetailValue label={t("common.email")} ltr>{inquiry.contact.email}</DetailValue>
              <DetailValue label={t("common.phone")} ltr>{inquiry.contact.phone}</DetailValue>
              {inquiry.contact.whatsappPhone ? <DetailValue label={t("common.whatsapp")} ltr>{inquiry.contact.whatsappPhone}</DetailValue> : null}
              {inquiry.contact.telegramUsername ? <DetailValue label={t("common.telegram")} ltr>{inquiry.contact.telegramUsername}</DetailValue> : null}
              <DetailValue label={t("common.preferredContact")}>{inquiry.contact.preferredMethods.map((method) => t(`contactMethods.${method}`)).join(", ")}</DetailValue>
            </dl>
          </StaffPanel>

          <StaffPanel title={t("inquiryDetail.location")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailValue label={t("common.origin")}>{[inquiry.location.city, inquiry.location.country].filter(Boolean).join(", ")}</DetailValue>
              <DetailValue label={t("common.destination")}>{[inquiry.destination.city, inquiry.destination.country].filter(Boolean).join(", ") || t("common.notProvided")}</DetailValue>
            </dl>
          </StaffPanel>

          <StaffPanel title={t("inquiryDetail.customerMessage")}>
            {inquiry.message ? <p className="whitespace-pre-wrap break-words text-sm leading-7 text-stone-800">{inquiry.message}</p> : <p className="text-sm text-stone-500">{t("states.noCustomerMessage")}</p>}
          </StaffPanel>

          <StaffPanel title={t("inquiryDetail.products")}>
            <ul className="divide-y divide-stone-200">
              {inquiry.items.map((item) => (
                <li key={`${item.productId}-${item.sku}`} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0"><h3 className="break-words font-semibold">{item.productName}</h3><p className="mt-1 break-all font-mono text-xs text-stone-500"><LtrIsolate>{item.sku}</LtrIsolate></p></div>
                  <p className="text-sm font-semibold text-stone-800">{formatHumanNumber(locale, item.quantity)} {t(`units.${item.unit}`)}</p>
                </li>
              ))}
            </ul>
          </StaffPanel>
        </div>

        <div className="space-y-4">
          <StaffPanel title={t("inquiryDetail.workflowHistory")}>
            {detail.workflowHistory.length === 0 ? <StaffState title={t("states.emptyWorkflowTitle")} description={t("states.emptyWorkflowDescription")} /> : (
              <ol className="space-y-4">
                {detail.workflowHistory.map((event) => (
                  <li key={event.id} className="relative border-s-2 border-stone-200 ps-4">
                    <span aria-hidden="true" className="absolute -start-[5px] top-1 size-2 rounded-full bg-emerald-700" />
                    <h3 className="text-sm font-bold text-stone-900">{t(`workflowEvents.${event.type}`)}</h3>
                    <p className="mt-1 text-xs leading-5 text-stone-600"><span>{valueLabel(event.previousValue)}</span> {valueArrow} <span>{valueLabel(event.newValue)}</span></p>
                    {event.actorReference ? <p className="mt-1 break-all font-mono text-[11px] text-stone-500"><LtrIsolate>{event.actorReference}</LtrIsolate></p> : null}
                    <p className="mt-2 text-xs text-stone-500"><StaffDateTime locale={locale} value={event.occurredAt} /></p>
                  </li>
                ))}
              </ol>
            )}
          </StaffPanel>

          <StaffPanel title={t("inquiryDetail.conversation")}>
            {detail.conversationMessages.length === 0 ? <StaffState title={t("states.emptyConversationTitle")} description={t("states.emptyConversationDescription")} /> : (
              <ol className="space-y-3">
                {detail.conversationMessages.map((message) => (
                  <li key={message.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-bold text-stone-800">{t(`senders.${message.senderType}`)}</span><span className="rounded-full bg-white px-2 py-1 text-stone-600">{t(`channels.${message.channel}`)}</span></div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">{message.body}</p>
                    <p className="mt-3 text-xs text-stone-500"><StaffDateTime locale={locale} value={message.createdAt} /></p>
                  </li>
                ))}
              </ol>
            )}
          </StaffPanel>
        </div>
      </div>
    </>
  );
}
