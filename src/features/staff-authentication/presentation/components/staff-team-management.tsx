"use client";

import {useId, useState, type FormEvent} from "react";

import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {changeStaffRole, createStaffInvitation, revokeStaffInvitation, setStaffActive} from "@/features/staff-authentication/presentation/clients/staff-management-client";
import {forceDisconnectStaffTelegram, revokeStaffTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/presentation/clients/telegram-staff-onboarding-client";
import type {StaffTeamManagementViewModel} from "@/features/staff-authentication/presentation/view-models/staff-team-management-view-model";
import {useRouter} from "@/i18n/navigation";
import type {Locale} from "@/shared/types/locale";

export type StaffTeamManagementLabels = Readonly<{
  title: string;
  description: string;
  createInvitation: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  telegram: string;
  linked: string;
  notLinked: string;
  active: string;
  inactive: string;
  invitations: string;
  accounts: string;
  actions: string;
  activationCode: string;
  activationCodeNotice: string;
  invitationCreated: string;
  submitInvitation: string;
  changeRole: string;
  deactivate: string;
  reactivate: string;
  forceDisconnectTelegram: string;
  revokeTelegramRequest: string;
  revoke: string;
  working: string;
  error: string;
  emptyInvitations: string;
  invitationStatuses: Readonly<Record<"ACTIVE" | "EXPIRED" | "CONSUMED" | "REVOKED", string>>;
  roles: Readonly<Record<StaffRole, string>>;
}>;

export function StaffTeamManagement({locale, labels, team}: Readonly<{locale: Locale; labels: StaffTeamManagementLabels; team: StaffTeamManagementViewModel}>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const [activation, setActivation] = useState<Readonly<{code: string; expiresAt: string}> | null>(null);

  async function refreshAfter(action: () => Promise<"completed" | "failed">) {
    if (working) return;
    setWorking(true);
    setError(false);
    const result = await action();
    setWorking(false);
    if (result === "failed") { setError(true); return; }
    router.refresh();
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = data.get("displayName");
    const email = data.get("email");
    const targetRole = data.get("targetRole");
    if (typeof displayName !== "string" || typeof email !== "string" || typeof targetRole !== "string") return;
    setWorking(true);
    setError(false);
    setActivation(null);
    const result = await createStaffInvitation(fetch, {displayName, email, targetRole: targetRole as StaffRole});
    setWorking(false);
    if (result.status !== "created") { setError(true); return; }
    form.reset();
    setActivation({code: result.activationCode, expiresAt: result.expiresAt});
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">{labels.accounts}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{labels.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">{labels.description}</p>
      </header>

      {team.allowedInvitationRoles.length > 0 ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="create-staff-invitation-title">
          <h2 id="create-staff-invitation-title" className="text-xl font-bold">{labels.createInvitation}</h2>
          <form onSubmit={submitInvitation} className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_14rem_auto] lg:items-end">
            <Field label={labels.displayName}><input name="displayName" required maxLength={120} className={inputClass} /></Field>
            <Field label={labels.email}><input name="email" type="email" required maxLength={254} dir="ltr" className={inputClass} /></Field>
            <Field label={labels.role}><select name="targetRole" required className={inputClass}>{team.allowedInvitationRoles.map((role) => <option key={role} value={role}>{labels.roles[role]}</option>)}</select></Field>
            <button type="submit" disabled={working} className={buttonClass}>{working ? labels.working : labels.submitInvitation}</button>
          </form>
          {activation ? (
            <div role="status" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="font-bold">{labels.invitationCreated}</p>
              <p className="mt-2 text-sm leading-6">{labels.activationCodeNotice}</p>
              <label className="mt-3 block text-xs font-semibold" htmlFor="new-staff-activation-code">{labels.activationCode}</label>
              <input id="new-staff-activation-code" readOnly dir="ltr" value={activation.code} className={`${inputClass} mt-1 font-mono`} onFocus={(event) => event.currentTarget.select()} />
              <p className="mt-2 text-xs">{labels.expiresAt}: {new Date(activation.expiresAt).toLocaleString(locale)}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{labels.error}</p> : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="staff-accounts-title">
        <h2 id="staff-accounts-title" className="text-xl font-bold">{labels.accounts}</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-start text-sm">
            <thead><tr className="border-b border-stone-200 text-stone-500"><Header>{labels.displayName}</Header><Header>{labels.email}</Header><Header>{labels.role}</Header><Header>{labels.status}</Header><Header>{labels.telegram}</Header><Header>{labels.createdAt}</Header><Header><span className="sr-only">{labels.actions}</span></Header></tr></thead>
            <tbody>{team.accounts.map((account) => (
              <tr key={account.id} className="border-b border-stone-100 align-top last:border-0">
                <Cell><span className="font-semibold">{account.displayName}</span></Cell>
                <Cell><span dir="ltr">{account.email}</span></Cell>
                <Cell>{labels.roles[account.role]}</Cell>
                <Cell>{account.active ? labels.active : labels.inactive}</Cell>
                <Cell>{account.telegramLinked ? labels.linked : labels.notLinked}</Cell>
                <Cell>{new Date(account.createdAt).toLocaleString(locale)}</Cell>
                <Cell>
                  <div className="flex min-w-48 flex-col gap-2">
                    {account.actions.allowedRoles.length > 0 ? <RoleForm currentRole={account.role} roles={account.actions.allowedRoles} labels={labels} staffMemberName={account.displayName} disabled={working} onSubmit={(role) => refreshAfter(() => changeStaffRole(fetch, account.id, role))} /> : null}
                    {account.actions.mayDeactivate ? <button disabled={working} className={secondaryButtonClass} onClick={() => void refreshAfter(() => setStaffActive(fetch, account.id, false))}>{labels.deactivate}</button> : null}
                    {account.actions.mayReactivate ? <button disabled={working} className={secondaryButtonClass} onClick={() => void refreshAfter(() => setStaffActive(fetch, account.id, true))}>{labels.reactivate}</button> : null}
                    {account.actions.mayForceDisconnectTelegram ? <button disabled={working} className={secondaryButtonClass} onClick={() => void refreshAfter(async () => await forceDisconnectStaffTelegram(fetch, account.id) ? "completed" : "failed")}>{labels.forceDisconnectTelegram}</button> : null}
                    {account.actions.mayRevokeTelegramRequest ? <button disabled={working} className={secondaryButtonClass} onClick={() => void refreshAfter(async () => await revokeStaffTelegramConnectionRequest(fetch, account.id) ? "completed" : "failed")}>{labels.revokeTelegramRequest}</button> : null}
                  </div>
                </Cell>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="staff-invitations-title">
        <h2 id="staff-invitations-title" className="text-xl font-bold">{labels.invitations}</h2>
        {team.invitations.length === 0 ? <p className="mt-4 text-sm text-stone-500">{labels.emptyInvitations}</p> : <ul className="mt-5 grid gap-3">{team.invitations.map((invitation) => (
          <li key={invitation.id} className="rounded-xl border border-stone-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{invitation.displayName}</p><p dir="ltr" className="mt-1 text-sm text-stone-600">{invitation.email}</p></div><span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold">{labels.invitationStatuses[invitation.status]}</span></div>
            <p className="mt-3 text-xs text-stone-500">{labels.roles[invitation.targetRole]} · {labels.expiresAt}: {new Date(invitation.expiresAt).toLocaleString(locale)}</p>
            {invitation.mayRevoke ? <button disabled={working} className={`${secondaryButtonClass} mt-3`} onClick={() => void refreshAfter(() => revokeStaffInvitation(fetch, invitation.id))}>{labels.revoke}</button> : null}
          </li>
        ))}</ul>}
      </section>
    </div>
  );
}

function RoleForm({currentRole, roles, labels, staffMemberName, disabled, onSubmit}: Readonly<{currentRole: StaffRole; roles: readonly StaffRole[]; labels: StaffTeamManagementLabels; staffMemberName: string; disabled: boolean; onSubmit(role: StaffRole): void}>) {
  const roleSelectId = useId();
  return <form onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("role"); if (typeof value === "string" && value !== currentRole) onSubmit(value as StaffRole); }} className="flex gap-2"><label htmlFor={roleSelectId} className="sr-only">{labels.role}: {staffMemberName}</label><select id={roleSelectId} name="role" defaultValue={currentRole} className={`${inputClass} min-w-0`}><option value={currentRole}>{labels.roles[currentRole]}</option>{roles.map((role) => <option key={role} value={role}>{labels.roles[role]}</option>)}</select><button type="submit" disabled={disabled} className={secondaryButtonClass}>{labels.changeRole}</button></form>;
}

function Field({label, children}: Readonly<{label: string; children: React.ReactNode}>) { return <label className="block text-sm font-semibold text-stone-800">{label}<span className="mt-2 block">{children}</span></label>; }
function Header({children}: Readonly<{children: React.ReactNode}>) { return <th scope="col" className="px-3 py-3 text-start font-semibold first:ps-0">{children}</th>; }
function Cell({children}: Readonly<{children: React.ReactNode}>) { return <td className="px-3 py-4 first:ps-0">{children}</td>; }

const inputClass = "min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-900 px-4 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
const secondaryButtonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60";
