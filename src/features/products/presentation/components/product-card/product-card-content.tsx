export function ProductCardContent({
  name,
  description,
  categoryLabels,
  isRtl,
}: {
  name: string;
  description: string;
  categoryLabels: readonly string[];
  isRtl: boolean;
}) {
  return (
    <>
      <ul className="flex min-h-7 flex-wrap items-center gap-2">
        {categoryLabels.map((categoryLabel) => (
          <li key={categoryLabel} className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-emerald-900/[0.045] px-3 py-1.5 text-[11px] font-semibold leading-none text-emerald-900 transition-colors duration-700 group-hover:border-emerald-900/15 group-hover:bg-emerald-900/[0.065] motion-reduce:transition-none">
            <span aria-hidden="true" className="size-1 rounded-full bg-emerald-700/70" />
            {categoryLabel}
          </li>
        ))}
      </ul>
      <h2 className={`mt-5 text-[clamp(1.35rem,2vw,1.65rem)] font-semibold leading-[1.25] text-stone-950 transition-colors duration-700 group-hover:text-emerald-950 motion-reduce:transition-none ${isRtl ? "" : "tracking-[-0.025em]"}`}>{name}</h2>
      <p className="mt-3 line-clamp-3 text-[15px] leading-7 text-stone-600">{description}</p>
      <div aria-hidden="true" className="mt-6 flex items-center gap-2">
        <span className="h-px w-8 bg-emerald-800/55 transition-[width,opacity] duration-700 group-hover:w-11 group-hover:opacity-80 motion-reduce:transition-none" />
        <span className="size-1 rounded-full bg-emerald-800/70" />
        <span className="h-px flex-1 bg-stone-950/[0.08]" />
      </div>
    </>
  );
}
