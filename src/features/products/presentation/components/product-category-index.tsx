import { Link } from "@/i18n/navigation";

export type ProductCategoryIndexItem = Readonly<{
  id: string;
  href: string;
  label: string;
}>;

export function ProductCategoryIndex({
  label,
  indexLabel,
  navigationLabel,
  items,
  isRtl,
}: {
  label: string;
  indexLabel: string;
  navigationLabel: string;
  items: readonly ProductCategoryIndexItem[];
  isRtl: boolean;
}) {
  return (
    <section className="border-b border-stone-950/[0.09] bg-white/[0.14]">
      <div className="mx-auto w-full max-w-[1900px] px-4 sm:px-8 lg:px-14 xl:px-20 2xl:px-24">
        <div className="grid items-stretch lg:grid-cols-[0.7fr_1.3fr]">
          <div className="flex min-h-24 items-center border-stone-950/[0.09] py-5 lg:min-h-32 lg:border-e lg:pe-10 xl:pe-14">
            <div>
              <p className={isRtl ? "text-xs font-semibold text-stone-400" : "text-[9px] font-semibold uppercase tracking-[0.28em] text-stone-400"}>{label}</p>
              <div className="mt-3 flex items-center gap-3">
                <span aria-hidden="true" className="size-2 rounded-full bg-emerald-800" />
                <span className="text-sm font-medium text-stone-700">{indexLabel}</span>
              </div>
            </div>
          </div>

          <nav aria-label={navigationLabel} className="grid grid-cols-2 sm:grid-cols-3">
            {items.map((item, index) => (
              <Link
                key={item.id}
                href={item.href}
                data-product-category-link=""
                aria-label={item.label}
                className={`group relative flex min-h-28 flex-col justify-between overflow-hidden border-stone-950/[0.09] px-4 py-5 outline-none transition-colors duration-500 hover:bg-white/45 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-800 motion-reduce:transition-none sm:min-h-32 sm:px-5 sm:py-6 xl:px-7 ${index > 0 ? "border-s" : ""} ${index >= 2 ? "border-t sm:border-t-0" : ""}`}
              >
                <span aria-hidden="true" dir="ltr" className="text-[9px] font-medium tracking-[0.2em] text-stone-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="relative z-10 flex items-end justify-between gap-3">
                  <span className="text-sm font-semibold text-stone-700 transition-transform duration-500 group-hover:-translate-y-0.5 motion-reduce:transition-none sm:text-base">{item.label}</span>
                  <span aria-hidden="true" className="shrink-0 text-emerald-800 opacity-50 transition-all duration-500 group-hover:translate-x-1 group-hover:opacity-100 motion-reduce:transition-none rtl:group-hover:-translate-x-1">{isRtl ? "←" : "→"}</span>
                </span>
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px origin-start scale-x-0 bg-emerald-800 transition-transform duration-500 group-hover:scale-x-100 motion-reduce:transition-none" />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
