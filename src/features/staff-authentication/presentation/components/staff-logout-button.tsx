"use client";

import {useState} from "react";

import {useRouter} from "@/i18n/navigation";
import {submitStaffLogout} from "@/features/staff-authentication/presentation/clients/staff-auth-client";

export type StaffLogoutButtonVariant = "dark" | "light";

type StaffLogoutButtonLabels = Readonly<{logout: string; loggingOut: string; error: string}>;

const buttonVariantClasses: Readonly<Record<StaffLogoutButtonVariant, string>> = {
  dark: "border-white/20 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-emerald-300",
  light: "border-stone-300 bg-white text-stone-800 hover:bg-stone-50 hover:text-emerald-900 focus-visible:ring-emerald-700",
};

const errorVariantClasses: Readonly<Record<StaffLogoutButtonVariant, string>> = {
  dark: "text-red-200",
  light: "text-red-700",
};

export function StaffLogoutButtonPresentation({
  failed,
  labels,
  onLogout,
  submitting,
  variant,
}: Readonly<{
  failed: boolean;
  labels: StaffLogoutButtonLabels;
  onLogout: () => void;
  submitting: boolean;
  variant: StaffLogoutButtonVariant;
}>) {
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={onLogout}
        disabled={submitting}
        className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none ${buttonVariantClasses[variant]}`}
      >
        {submitting ? labels.loggingOut : labels.logout}
      </button>
      {failed ? <p role="alert" className={`max-w-52 break-words text-xs leading-5 ${errorVariantClasses[variant]}`}>{labels.error}</p> : null}
    </div>
  );
}

export function StaffLogoutButton({labels, variant}: Readonly<{labels: StaffLogoutButtonLabels; variant: StaffLogoutButtonVariant}>) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    if (submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      const result = await submitStaffLogout(fetch);
      if (result !== "logged_out") {
        setFailed(true);
        return;
      }
      router.replace("/staff/login");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return <StaffLogoutButtonPresentation labels={labels} variant={variant} submitting={submitting} failed={failed} onLogout={logout} />;
}
