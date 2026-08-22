import { HomeHeroBackground } from "@/shared/presentation/home/components/home-hero-background";
import { HomeHeroContent } from "@/shared/presentation/home/components/home-hero-content";
import { HomeHeroVisual } from "@/shared/presentation/home/components/home-hero-visual";
import type { HomeHeroViewModel } from "@/shared/presentation/home/view-models/home-hero-view-model";

export function HomeHero({ model }: { model: HomeHeroViewModel }) {
  return (
    <section dir={model.isRtl ? "rtl" : "ltr"} className="relative isolate overflow-hidden bg-[#f3f1eb] text-stone-950">
      <HomeHeroBackground />
      <div aria-hidden="true" dir="ltr" className="pointer-events-none absolute start-1/2 top-[48%] z-0 max-w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden whitespace-nowrap text-[clamp(7rem,23vw,29rem)] font-black leading-none tracking-[-0.09em] text-stone-950/[0.025]">YOLPOL</div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-88px)] w-full max-w-[1900px] flex-col px-4 sm:px-8 lg:px-10 xl:px-14 min-[1600px]:px-20">
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-stone-950/[0.09]">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-emerald-800 shadow-[0_0_18px_rgba(6,78,59,0.35)]" />
            <span dir="ltr" className="text-[9px] font-semibold tracking-[0.28em] text-stone-600">YOLPOL</span>
            <span aria-hidden="true" className="hidden h-px w-10 bg-stone-950/15 sm:block" />
            <span className={`hidden text-[9px] font-medium text-stone-400 sm:inline ${model.isRtl ? "" : "uppercase tracking-[0.2em]"}`}>{model.glassExport}</span>
          </div>
          <div aria-hidden="true" dir="ltr" className="flex shrink-0 items-center gap-2 text-[8px] font-semibold tracking-[0.18em] text-stone-400 sm:gap-4"><span>IR</span><span>•</span><span>TR</span><span>•</span><span>IQ</span><span className="hidden sm:inline">• GCC</span></div>
        </div>

        <div dir="ltr" className={`relative grid flex-1 items-center gap-6 py-6 lg:gap-0 ${model.isRtl ? "lg:grid-cols-[1.12fr_0.88fr]" : "lg:grid-cols-[0.88fr_1.12fr]"}`}>
          <HomeHeroContent model={model} />
          <HomeHeroVisual model={model} />
        </div>

        <div className="flex min-h-20 items-center justify-between gap-4 border-t border-stone-950/[0.09]">
          <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-800" /><span className="truncate text-[9px] font-semibold text-stone-400">{model.exportPlanning}</span></div>
          <div aria-hidden="true" dir="ltr" className="flex shrink-0 gap-2 text-[8px] font-semibold tracking-[0.16em] text-stone-400 sm:gap-4"><span>IR</span><span>•</span><span>TR</span><span>•</span><span>IQ</span><span className="hidden sm:inline">• GCC • INTL</span></div>
        </div>
      </div>
    </section>
  );
}
