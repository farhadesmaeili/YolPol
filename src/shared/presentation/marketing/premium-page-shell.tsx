import type {ReactNode} from "react";

import {Link} from "@/i18n/navigation";

export function PremiumPageShell({children}: {children: ReactNode}) {
  return <div className="relative isolate overflow-hidden bg-[#f3f1eb] text-start text-stone-950"><div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"><div className="absolute -start-80 -top-80 size-[48rem] max-w-[90vw] rounded-full bg-emerald-700/[0.06] blur-[150px]" /><div className="absolute -end-80 top-[20%] size-[46rem] max-w-[85vw] rounded-full bg-[#d8c7a3]/20 blur-[170px]" /></div>{children}</div>;
}

export function PremiumBreadcrumbs({label, home, current}: {label: string; home: string; current: string}) {
  return <nav aria-label={label} className="text-sm text-stone-500"><Link href="/" className="outline-none hover:text-emerald-900 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700">{home}</Link><span aria-hidden="true" className="mx-2 text-stone-300">/</span><span aria-current="page" className="text-stone-800">{current}</span></nav>;
}

export const premiumPrimaryLinkClass = "inline-flex min-h-12 items-center justify-center bg-emerald-950 px-6 text-sm font-semibold text-white outline-none transition-colors duration-500 hover:bg-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none";
export const premiumSecondaryLinkClass = "inline-flex min-h-12 items-center justify-center border border-stone-950/15 bg-white/40 px-6 text-sm font-semibold text-stone-800 outline-none transition-colors duration-500 hover:bg-white/75 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none";
