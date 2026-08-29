"use client";

import {useState, type FormEvent} from "react";

import {activateStaffInvitation} from "@/features/staff-authentication/presentation/clients/staff-management-client";
import {minimumStaffPasswordLength} from "@/features/staff-authentication/domain/value-objects/staff-password";
import {Link} from "@/i18n/navigation";

export type StaffActivationLabels = Readonly<{
  email: string;
  activationCode: string;
  password: string;
  passwordHint: string;
  activate: string;
  activating: string;
  unavailable: string;
  invalidPassword: string;
  failed: string;
  success: string;
  signIn: string;
}>;

export function StaffActivationForm({labels}: Readonly<{labels: StaffActivationLabels}>) {
  const [state, setState] = useState<"idle" | "submitting" | "invitation_unavailable" | "invalid_password" | "failed" | "activated">("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = data.get("email");
    const activationCode = data.get("activationCode");
    const password = data.get("password");
    if (typeof email !== "string" || typeof activationCode !== "string" || typeof password !== "string") { setState("failed"); return; }
    setState("submitting");
    const result = await activateStaffInvitation(fetch, {email, activationCode, password});
    setState(result);
    if (result === "activated") form.reset();
  }
  if (state === "activated") return <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">{labels.success}</p><Link href="/staff/login" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">{labels.signIn}</Link></div>;
  const error = state === "invitation_unavailable" ? labels.unavailable : state === "invalid_password" ? labels.invalidPassword : state === "failed" ? labels.failed : null;
  return <form onSubmit={submit} className="mt-6 space-y-4">
    <ActivationField label={labels.email}><input name="email" type="email" autoComplete="email" required dir="ltr" className={inputClass} /></ActivationField>
    <ActivationField label={labels.activationCode}><input name="activationCode" autoComplete="one-time-code" required dir="ltr" className={`${inputClass} font-mono`} /></ActivationField>
    <ActivationField label={labels.password}><input name="password" type="password" autoComplete="new-password" minLength={minimumStaffPasswordLength} required dir="ltr" className={inputClass} /><span className="mt-1 block text-xs font-normal text-stone-500">{labels.passwordHint}</span></ActivationField>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <button type="submit" disabled={state === "submitting"} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white disabled:opacity-60">{state === "submitting" ? labels.activating : labels.activate}</button>
  </form>;
}

function ActivationField({label, children}: Readonly<{label: string; children: React.ReactNode}>) { return <label className="block text-sm font-semibold text-stone-800">{label}<span className="mt-2 block">{children}</span></label>; }
const inputClass = "min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-start outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20";
