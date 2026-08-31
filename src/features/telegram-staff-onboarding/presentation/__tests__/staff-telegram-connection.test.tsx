import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {StaffTelegramConnection, type StaffTelegramConnectionLabels} from "@/features/telegram-staff-onboarding/presentation/components/staff-telegram-connection";
import {getLocaleDirection} from "@/i18n/locale";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import type {Locale} from "@/shared/types/locale";

const messages = {en: enMessages.Staff, tr: trMessages.Staff, fa: faMessages.Staff, ar: arMessages.Staff} as const;

function labels(locale: Locale): StaffTelegramConnectionLabels {
  const staff = messages[locale];
  return {
    title: staff.telegramConnection.title, description: staff.telegramConnection.description, status: staff.common.status,
    notConnected: staff.telegramConnection.notConnected, pending: staff.telegramConnection.pending, connected: staff.telegramConnection.connected,
    pendingDescription: staff.telegramConnection.pendingDescription, pendingReloadDescription: staff.telegramConnection.pendingReloadDescription,
    expiresAt: staff.teamManagement.expiresAt, connect: staff.telegramConnection.connect, createFresh: staff.telegramConnection.createFresh,
    openBot: staff.telegramConnection.openBot, cancel: staff.telegramConnection.cancel, disconnect: staff.telegramConnection.disconnect,
    refresh: staff.telegramConnection.refresh, working: staff.teamManagement.working, error: staff.telegramConnection.error,
  };
}

describe("Staff Telegram connection UI", () => {
  it.each(["en", "tr", "fa", "ar"] as const)("renders localized accessible status in %s within the correct page direction", (locale) => {
    const html = renderToStaticMarkup(<div lang={locale} dir={getLocaleDirection(locale)}><StaffTelegramConnection locale={locale} labels={labels(locale)} initialConnection={{status: "NOT_CONNECTED"}} /></div>);
    expect(html).toContain(`lang="${locale}" dir="${getLocaleDirection(locale)}"`);
    expect(html).toContain(messages[locale].telegramConnection.title);
    expect(html).toContain(messages[locale].telegramConnection.connect.replaceAll("'", "&#x27;"));
    expect(html).toContain('aria-labelledby="staff-telegram-connection-title"');
  });

  it("renders reload-safe pending UX without reconstructing or exposing a one-time link", () => {
    const html = renderToStaticMarkup(<StaffTelegramConnection locale="en" labels={labels("en")} initialConnection={{status: "PENDING", pendingExpiresAt: "2026-08-30T12:10:00.000Z"}} />);
    expect(html).toContain(enMessages.Staff.telegramConnection.pendingReloadDescription);
    expect(html).toContain(enMessages.Staff.telegramConnection.createFresh);
    expect(html).toContain(enMessages.Staff.telegramConnection.cancel);
    expect(html).not.toContain("https://t.me/");
    expect(html).not.toContain(enMessages.Staff.telegramConnection.openBot);
  });

  it("renders disconnect only for the connected state and never displays raw Telegram identifiers", () => {
    const html = renderToStaticMarkup(<StaffTelegramConnection locale="en" labels={labels("en")} initialConnection={{status: "CONNECTED"}} />);
    expect(html).toContain(`<strong class="text-emerald-800">${enMessages.Staff.telegramConnection.connected}</strong>`);
    expect(html).toContain(enMessages.Staff.telegramConnection.disconnect);
    expect(html).not.toMatch(/telegramUserId|privateChatId|teamMemberId|connectionToken|tokenLookup|tokenVerification/iu);
  });
});
