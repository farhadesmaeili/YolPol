"use client";

import type {ReactNode} from "react";

import {usePathname} from "@/i18n/navigation";

export function PublicSiteFrame({
  children,
  footer,
  header,
}: Readonly<{children: ReactNode; footer: ReactNode; header: ReactNode}>) {
  const pathname = usePathname();
  const isStaffPath = pathname === "/staff" || pathname.startsWith("/staff/");

  if (isStaffPath) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <main id="main-content" className="flex-1">{children}</main>
      {footer}
    </div>
  );
}
