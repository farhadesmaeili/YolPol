"use client";

import {useState} from "react";

import {
  createOwnTelegramConnectionRequest,
  disconnectOwnTelegram,
  readOwnTelegramConnection,
  revokeOwnTelegramConnectionRequest,
} from "@/features/telegram-staff-onboarding/presentation/clients/telegram-staff-onboarding-client";
import type {TelegramConnectionViewModel} from "@/features/telegram-staff-onboarding/presentation/view-models/telegram-connection-view-model";
import type {Locale} from "@/shared/types/locale";

export type StaffTelegramConnectionLabels = Readonly<{
  title: string;
  description: string;
  status: string;
  notConnected: string;
  pending: string;
  connected: string;
  pendingDescription: string;
  pendingReloadDescription: string;
  expiresAt: string;
  connect: string;
  createFresh: string;
  openBot: string;
  cancel: string;
  disconnect: string;
  refresh: string;
  working: string;
  error: string;
}>;

type MemoryLink = Readonly<{href: string; expiresAt: string}>;

export function StaffTelegramConnection({locale, labels, initialConnection}: Readonly<{
  locale: Locale;
  labels: StaffTelegramConnectionLabels;
  initialConnection: TelegramConnectionViewModel | null;
}>) {
  const [connection, setConnection] = useState(initialConnection);
  const [memoryLink, setMemoryLink] = useState<MemoryLink | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(initialConnection === null);

  async function createRequest() {
    if (working) return;
    setWorking(true); setError(false); setMemoryLink(null);
    const result = await createOwnTelegramConnectionRequest(fetch);
    setWorking(false);
    if (!result) { setError(true); return; }
    setMemoryLink({href: result.deepLink, expiresAt: result.expiresAt});
    setConnection({status: "PENDING", pendingExpiresAt: result.expiresAt});
  }

  async function refresh() {
    if (working) return;
    setWorking(true); setError(false);
    const result = await readOwnTelegramConnection(fetch);
    setWorking(false);
    if (!result) { setError(true); return; }
    setConnection(result);
    if (result.status !== "PENDING") setMemoryLink(null);
  }

  async function mutate(action: () => Promise<boolean>, next: TelegramConnectionViewModel) {
    if (working) return;
    setWorking(true); setError(false);
    const completed = await action();
    setWorking(false);
    if (!completed) { setError(true); return; }
    setMemoryLink(null); setConnection(next);
  }

  const statusLabel = connection?.status === "CONNECTED" ? labels.connected : connection?.status === "PENDING" ? labels.pending : labels.notConnected;
  const pendingExpiry = connection?.status === "PENDING" ? connection.pendingExpiresAt : undefined;

  return (
    <section aria-labelledby="staff-telegram-connection-title" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 id="staff-telegram-connection-title" className="text-lg font-bold">{labels.title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{labels.description}</p>
      <p className="mt-4 text-sm"><span className="text-stone-500">{labels.status}: </span><strong>{statusLabel}</strong></p>

      {connection?.status === "PENDING" ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>{memoryLink ? labels.pendingDescription : labels.pendingReloadDescription}</p>
          {pendingExpiry ? <p className="mt-2 text-xs">{labels.expiresAt}: <time dateTime={pendingExpiry}>{new Date(pendingExpiry).toLocaleString(locale)}</time></p> : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{labels.error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {!connection || connection.status === "NOT_CONNECTED" ? <button type="button" disabled={working} onClick={() => void createRequest()} className={primaryButton}>{working ? labels.working : labels.connect}</button> : null}
        {connection?.status === "PENDING" ? (
          <>
            {memoryLink ? <a href={memoryLink.href} target="_blank" rel="noopener noreferrer" className={primaryButton}>{labels.openBot}</a> : null}
            <button type="button" disabled={working} onClick={() => void createRequest()} className={secondaryButton}>{labels.createFresh}</button>
            <button type="button" disabled={working} onClick={() => void mutate(() => revokeOwnTelegramConnectionRequest(fetch), {status: "NOT_CONNECTED"})} className={secondaryButton}>{labels.cancel}</button>
          </>
        ) : null}
        {connection?.status === "CONNECTED" ? <button type="button" disabled={working} onClick={() => void mutate(() => disconnectOwnTelegram(fetch), {status: "NOT_CONNECTED"})} className={secondaryButton}>{labels.disconnect}</button> : null}
        <button type="button" disabled={working} onClick={() => void refresh()} className={secondaryButton}>{labels.refresh}</button>
      </div>
    </section>
  );
}

const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-900 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
