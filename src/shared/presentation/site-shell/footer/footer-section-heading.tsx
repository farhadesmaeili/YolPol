import type { ReactNode } from "react";

export function FooterSectionHeading({
  children,
  id,
  index,
  isRtl,
}: {
  children: ReactNode;
  id?: string;
  index: string;
  isRtl: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" dir="ltr" className="text-[9px] font-semibold text-emerald-800">{index}</span>
      <span aria-hidden="true" className="h-px w-6 bg-stone-950/15" />
      <h2 id={id} className={isRtl ? "text-sm font-semibold text-stone-950" : "text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-700"}>{children}</h2>
    </div>
  );
}
