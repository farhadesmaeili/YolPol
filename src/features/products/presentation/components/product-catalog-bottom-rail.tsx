export function ProductCatalogBottomRail({ label }: { label: string }) {
  return (
    <section className="border-t border-stone-950/[0.09]">
      <div className="mx-auto flex min-h-24 w-full max-w-[1900px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-14 xl:px-20 2xl:px-24">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-800 shadow-[0_0_14px_rgba(6,78,59,0.3)]" />
          <span className="text-[9px] font-semibold text-stone-400">{label}</span>
        </div>
        <div aria-hidden="true" className="hidden flex-1 lg:block"><div className="mx-10 h-px bg-gradient-to-r from-transparent via-stone-950/[0.08] to-transparent" /></div>
        <div aria-hidden="true" dir="ltr" className="flex shrink-0 items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-stone-400 sm:gap-4 sm:text-[9px] sm:tracking-[0.22em]">
          <span>IR</span><span>•</span><span>TR</span><span>•</span><span>IQ</span><span className="hidden sm:inline">• GCC</span>
        </div>
      </div>
    </section>
  );
}
