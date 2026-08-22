export type ProductCatalogStatusItem = Readonly<{ label: string; value: string; ltr?: boolean }>;

export function ProductCatalogHeader({
  indexLabel,
  title,
  description,
  formattedCount,
  countLabel,
  countSummary,
  statuses,
  isRtl,
}: {
  indexLabel: string;
  title: string;
  description: string;
  formattedCount: string;
  countLabel: string;
  countSummary: string;
  statuses: readonly ProductCatalogStatusItem[];
  isRtl: boolean;
}) {
  return (
    <div className="mb-10 border-b border-stone-950/[0.10] pb-8 sm:mb-12 sm:pb-9 lg:mb-14">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="h-px w-10 bg-emerald-900/60 sm:w-14" />
            <span className={isRtl ? "text-xs font-semibold text-emerald-950/65" : "text-[9px] font-semibold uppercase tracking-[0.28em] text-emerald-950/65"}>{indexLabel}</span>
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em] text-stone-950 sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-stone-600 sm:text-lg">{description}</p>
        </div>

        <div className="shrink-0">
          <div aria-label={countSummary} className="flex items-baseline gap-3">
            <span className="text-5xl font-light tracking-[-0.07em] text-stone-950 sm:text-6xl">{formattedCount}</span>
            <span className={isRtl ? "text-xs font-semibold text-stone-400" : "text-[9px] font-semibold uppercase tracking-[0.24em] text-stone-400"}>{countLabel}</span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-stone-950/[0.09] bg-stone-950/[0.09] sm:grid-cols-3 lg:min-w-[420px]">
            {statuses.map((status, index) => (
              <div key={status.label} className={`bg-[#f3f1eb]/90 px-4 py-3 sm:px-5 sm:py-4 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                <dt className={isRtl ? "text-[10px] font-semibold text-stone-400" : "text-[8px] font-semibold uppercase tracking-[0.2em] text-stone-400"}>{status.label}</dt>
                <dd dir={status.ltr ? "ltr" : undefined} className="mt-2 flex items-center gap-2 text-xs font-medium text-stone-700">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-800" />
                  <span>{status.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
