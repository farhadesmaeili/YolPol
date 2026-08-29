"use client";

import {useState, type FormEvent} from "react";

import {useRouter} from "@/i18n/navigation";
import {submitStaffLogin} from "@/features/staff-authentication/presentation/clients/staff-auth-client";
import type {Locale} from "@/shared/types/locale";

export type StaffLoginLabels = Readonly<{
  email: string;
  emailPlaceholder: string;
  error: string;
  hidePassword: string;
  password: string;
  showPassword: string;
  signIn: string;
  signingIn: string;
}>;

export function togglePasswordVisibility(current: boolean): boolean {
  return !current;
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 3 18 18" />
      <path d="M10.6 6.15A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-2.15 2.85" />
      <path d="M6.1 6.1C3.75 7.75 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3.35-.58" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function StaffPasswordField({
  labels,
  onToggle,
  passwordVisible,
}: Readonly<{
  labels: Pick<StaffLoginLabels, "hidePassword" | "password" | "showPassword">;
  onToggle: () => void;
  passwordVisible: boolean;
}>) {
  return (
    <div>
      <label htmlFor="staff-password" className="mb-2 block text-sm font-semibold text-stone-800">
        {labels.password}
      </label>
      <div className="relative">
        <input
          id="staff-password"
          name="password"
          type={passwordVisible ? "text" : "password"}
          autoComplete="current-password"
          required
          dir="ltr"
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-start text-stone-950 outline-none transition focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20 ltr:pe-14 rtl:ps-14 motion-reduce:transition-none"
        />
        <button
          type="button"
          aria-label={passwordVisible ? labels.hidePassword : labels.showPassword}
          aria-pressed={passwordVisible}
          onClick={onToggle}
          onMouseDown={(event) => event.preventDefault()}
          className="absolute end-1.5 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 outline-none transition-colors hover:bg-stone-100 hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 motion-reduce:transition-none"
        >
          {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

export function StaffLoginForm({labels, locale}: Readonly<{labels: StaffLoginLabels; locale: Locale}>) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setFailed(true);
      return;
    }

    setSubmitting(true);
    setFailed(false);
    try {
      const result = await submitStaffLogin(fetch, {email, password});
      if (result !== "authenticated") {
        setFailed(true);
        return;
      }
      form.reset();
      router.replace("/staff");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form method="post" action="/api/staff/auth/login" encType="application/x-www-form-urlencoded" className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate={false}>
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label htmlFor="staff-email" className="mb-2 block text-sm font-semibold text-stone-800">
          {labels.email}
        </label>
        <input
          id="staff-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          dir="ltr"
          placeholder={labels.emailPlaceholder}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-start text-stone-950 outline-none transition focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20 motion-reduce:transition-none"
        />
      </div>
      <StaffPasswordField
        labels={labels}
        passwordVisible={passwordVisible}
        onToggle={() => setPasswordVisible(togglePasswordVisibility)}
      />
      {failed ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {labels.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white outline-none transition hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none"
      >
        {submitting ? labels.signingIn : labels.signIn}
      </button>
    </form>
  );
}
