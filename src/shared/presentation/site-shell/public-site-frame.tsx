"use client";

import type {ReactNode} from "react";

import {usePathname} from "@/i18n/navigation";

export function PublicSiteFrame({
  children,
  footer,
  header,
  skipToContent,
}: Readonly<{children: ReactNode; footer: ReactNode; header: ReactNode; skipToContent: string}>) {
  const pathname = usePathname();
  const isStaffPath = pathname === "/staff" || pathname.startsWith("/staff/");

  if (isStaffPath) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only rounded bg-white px-4 py-3 focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:ring-2 focus:ring-emerald-800">
        {skipToContent}
      </a>
      {header}
      <main id="main-content" className="flex-1">{children}</main>
      {footer}
    </div>
  );
}
