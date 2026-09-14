"use client";

import {useState} from "react";

import type {NotificationDestinationAuditEventType, NotificationDestinationsDto} from "@/features/notification-destinations/application/dto/notification-destination-dto";
import {mutateNotificationDestination, type NotificationDestinationCommand} from "@/features/notification-destinations/presentation/clients/notification-destination-client";
import {useRouter} from "@/i18n/navigation";
import type {Locale} from "@/shared/types/locale";

export type NotificationDestinationLabels = Readonly<{
  title: string; description: string; teamMembers: string; groups: string; audit: string; auditEmpty: string;
  linked: string; authorized: string; disconnected: string; enabled: string; disabled: string; status: string;
  enable: string; disable: string; disconnect: string; createGroup: string; openTelegram: string; revokeRequest: string;
  pendingGroup: string; expiresAt: string; working: string; error: string; telegramRequired: string; emptyGroups: string;
  eventTypes: Readonly<Record<NotificationDestinationAuditEventType, string>>;
}>;

type MemoryLink = Readonly<{href: string; expiresAt: string}>;

export function NotificationDestinationsPanel({locale, labels, initial}: Readonly<{locale: Locale; labels: NotificationDestinationLabels; initial: NotificationDestinationsDto}>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryLink, setMemoryLink] = useState<MemoryLink | null>(null);

  async function mutate(command: NotificationDestinationCommand) {
    if (working) return;
    setWorking(true); setError(null);
    const result = await mutateNotificationDestination(fetch, command);
    setWorking(false);
    if (result.status === "failed") { setError(result.code === "telegram_not_linked" ? labels.telegramRequired : labels.error); return; }
    if (result.status === "group_request") setMemoryLink({href: result.deepLink, expiresAt: result.expiresAt});
    else if (command.operation === "REVOKE_GROUP_REQUEST") setMemoryLink(null);
    router.refresh();
  }

  const pendingExpiry = memoryLink?.expiresAt ?? initial.pendingGroupRequestExpiresAt;
  return <div className="space-y-6">
    <header><h1 className="text-3xl font-bold tracking-tight">{labels.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">{labels.description}</p></header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}

    <section aria-labelledby="notification-team-members" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="notification-team-members" className="text-xl font-bold">{labels.teamMembers}</h2>
      <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{initial.teamMembers.map((member) => <li key={member.staffAccountId} className="rounded-xl border border-stone-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{member.displayName}</p><p className="mt-1 text-xs text-stone-500">{member.role}</p></div><Badge active={member.notificationsEnabled} activeLabel={labels.enabled} inactiveLabel={labels.disabled} /></div>
        <p className="mt-3 text-xs text-stone-600">{member.telegramLinked ? labels.linked : labels.disconnected} · {member.authorized ? labels.authorized : labels.disconnected}</p>
        {member.mayManage ? <button type="button" disabled={working} className={secondaryButton} onClick={() => void mutate({operation: member.notificationsEnabled ? "DISABLE_TEAM_MEMBER" : "ENABLE_TEAM_MEMBER", staffAccountId: member.staffAccountId})}>{working ? labels.working : member.notificationsEnabled ? labels.disable : labels.enable}</button> : null}
      </li>)}</ul>
    </section>

    <section aria-labelledby="notification-groups" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="notification-groups" className="text-xl font-bold">{labels.groups}</h2><button type="button" disabled={working || !initial.mayCreateGroupRequest} className={primaryButton} onClick={() => void mutate({operation: "CREATE_GROUP_REQUEST"})}>{working ? labels.working : labels.createGroup}</button></div>
      {pendingExpiry ? <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>{labels.pendingGroup}</p><p className="mt-2 text-xs">{labels.expiresAt}: {new Date(pendingExpiry).toLocaleString(locale)}</p><div className="mt-3 flex flex-wrap gap-2">{memoryLink ? <a className={primaryButton} href={memoryLink.href} target="_blank" rel="noopener noreferrer">{labels.openTelegram}</a> : null}<button type="button" disabled={working} className={secondaryButton} onClick={() => void mutate({operation: "REVOKE_GROUP_REQUEST"})}>{labels.revokeRequest}</button></div></div> : null}
      {initial.groups.length === 0 ? <p className="mt-5 text-sm text-stone-500">{labels.emptyGroups}</p> : <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{initial.groups.map((group) => <li key={group.recipientId} className="rounded-xl border border-stone-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><p className="font-semibold">{group.displayName}</p><Badge active={group.notificationsEnabled} activeLabel={labels.enabled} inactiveLabel={labels.disabled} /></div>
        <p className="mt-3 text-xs text-stone-600">{labels.status}: {group.authorized ? labels.authorized : labels.disconnected}</p>
        <div className="mt-4 flex flex-wrap gap-2">{group.authorized ? <button type="button" disabled={working} className={secondaryButton} onClick={() => void mutate({operation: group.notificationsEnabled ? "DISABLE_GROUP" : "ENABLE_GROUP", recipientId: group.recipientId})}>{group.notificationsEnabled ? labels.disable : labels.enable}</button> : null}<button type="button" disabled={working || !group.authorized} className={secondaryButton} onClick={() => void mutate({operation: "DISCONNECT_GROUP", recipientId: group.recipientId})}>{labels.disconnect}</button></div>
      </li>)}</ul>}
    </section>

    <section aria-labelledby="notification-audit" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="notification-audit" className="text-xl font-bold">{labels.audit}</h2>
      {initial.auditEvents.length === 0 ? <p className="mt-4 text-sm text-stone-500">{labels.auditEmpty}</p> : <ol className="mt-5 grid gap-3">{initial.auditEvents.map((event) => <li key={event.id} className="rounded-xl border border-stone-200 p-4 text-sm"><p className="font-semibold">{labels.eventTypes[event.eventType]} · {event.displayName}</p><p className="mt-2 text-xs text-stone-500">{event.actorDisplayName} · {new Date(event.occurredAt).toLocaleString(locale)}</p></li>)}</ol>}
    </section>
  </div>;
}

function Badge({active, activeLabel, inactiveLabel}: Readonly<{active: boolean; activeLabel: string; inactiveLabel: string}>) { return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-900" : "bg-stone-100 text-stone-700"}`}>{active ? activeLabel : inactiveLabel}</span>; }
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-900 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
const secondaryButton = "mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
