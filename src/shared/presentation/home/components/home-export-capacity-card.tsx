import { Link } from "@/i18n/navigation";
import { NumberUnit } from "@/shared/presentation/bidi/bidi-isolate";
import { HomeExportTruckDiagram } from "@/shared/presentation/home/components/home-export-truck-diagram";
import type { HomeHeroViewModel } from "@/shared/presentation/home/view-models/home-hero-view-model";

export function HomeExportCapacityCard({ model }: { model: HomeHeroViewModel }) {
  return (
    <section
      aria-label={model.capacitySummary}
      className="relative w-full max-w-[780px] overflow-hidden border border-stone-950/[0.10] bg-white/40 shadow-[0_24px_80px_-52px_rgba(28,25,23,0.55)] backdrop-blur-xl"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -start-24 -top-24 size-56 rounded-full bg-emerald-700/[0.09] blur-3xl" />
      <div className="relative flex items-center justify-between gap-4 border-b border-stone-950/[0.08] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-stone-800">{model.capacityTitle}</h2>
          <p className="mt-1 text-xs leading-5 text-stone-500">{model.capacityDescription}</p>
        </div>
        <span className="shrink-0 border border-emerald-900/15 bg-emerald-800/[0.08] px-2.5 py-1 text-[8px] font-bold text-emerald-950">
          {model.planningLimit}
        </span>
      </div>

      <div className="relative grid sm:grid-cols-[minmax(0,1fr)_132px]">
        <div className="border-b border-stone-950/[0.08] px-4 pb-6 pt-5 sm:border-b-0 sm:border-e sm:px-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-2.5">
              <span className="text-4xl font-extralight leading-none tracking-[-0.08em]">{model.formattedPalletCount}</span>
              <span className="text-xs font-semibold text-stone-500">{model.palletsLabel}</span>
            </div>
            <div className="text-end text-xs text-stone-500">
              <bdi className="font-semibold [unicode-bidi:isolate]">{model.layout}</bdi>
              <span className="mt-1 block">{model.palletLayout}</span>
            </div>
          </div>

          <HomeExportTruckDiagram palletCount={model.palletCount} />
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-1">
          <div className="p-4 sm:p-5">
            <dt className="text-[10px] font-semibold text-stone-500">{model.maximumGrossWeight}</dt>
            <dd className="mt-2 text-lg font-light text-stone-950">
              <NumberUnit locale={model.locale} value={model.grossWeightKilograms} unit={model.kilograms} />
            </dd>
          </div>
          <div className="border-s border-stone-950/[0.08] p-4 sm:border-s-0 sm:border-t sm:p-5">
            <dt className="text-[10px] font-semibold text-stone-500">{model.tradeMode}</dt>
            <dd dir="ltr" className="mt-2 text-2xl font-light">B2B</dd>
            <Link href="/export-logistics" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-900 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-800">
              {model.exportLabel}
            </Link>
          </div>
        </dl>
      </div>
    </section>
  );
}
