import Image from "next/image";

import styles from "@/shared/presentation/home/styles/home-hero.module.css";
import type { HomeHeroViewModel } from "@/shared/presentation/home/view-models/home-hero-view-model";

export function HomeHeroVisual({ model }: { model: HomeHeroViewModel }) {
  return (
    <div dir="ltr" className={`relative z-20 min-h-[500px] sm:min-h-[680px] lg:min-h-[820px] ${model.isRtl ? "lg:order-1" : "lg:order-2"}`}>
      <div aria-hidden="true" className={`${styles.ambient} absolute start-1/2 top-1/2 size-[82%] rounded-full bg-emerald-700/[0.12] blur-[100px]`} />
      <HomeHeroOrbits />

      <div className={`${styles.portal} absolute start-1/2 top-1/2 z-10 h-[76%] w-[96%] max-w-full sm:h-[74%] sm:w-[94%] lg:h-[72%] lg:w-[96%]`}>
        <div aria-hidden="true" className="absolute -inset-10 bg-emerald-800/[0.09] blur-[65px]" />
        <div className="group relative h-full w-full overflow-hidden border border-white/60 bg-stone-200 shadow-[0_50px_145px_-38px_rgba(28,25,23,0.52)]">
          <div className={`absolute inset-0 ${model.isRtl ? styles.imageRtl : styles.imageLtr}`}>
            <Image
              src="/images/home/hero/yolpol-home-hero-desktop.webp"
              alt={model.imageAlt}
              fill
              priority
              sizes="(min-width: 1024px) 58vw, 94vw"
              className={`object-cover transition-[filter] duration-700 group-hover:saturate-[1.04] motion-reduce:transition-none ${model.isRtl ? "object-[44%_center]" : "object-[56%_center]"}`}
            />
          </div>
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-stone-950/28 via-transparent to-white/5" />
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(28,25,23,0.13)_100%)]" />
          <div aria-hidden="true" className={`absolute top-[-25%] h-[155%] w-[20%] bg-gradient-to-r from-transparent via-white/30 to-transparent blur-xl ${model.isRtl ? `end-0 ${styles.sweepRtl}` : `start-0 ${styles.sweepLtr}`}`} />
          <div aria-hidden="true" className={`${styles.scan} absolute start-[8%] top-[8%] h-px w-[84%] bg-gradient-to-r from-transparent via-white/55 to-transparent`} />
          <FrameCorners />
          <div className="absolute start-6 top-6 z-30 flex items-center gap-3 sm:start-8 sm:top-8">
            <span aria-hidden="true" className="size-2 rounded-full bg-emerald-300 shadow-[0_0_15px_rgba(110,231,183,0.8)]" />
            <span dir={model.isRtl ? "rtl" : "ltr"} className="text-[9px] font-semibold text-white/80">{model.referenceConfiguration}</span>
          </div>
          <div aria-hidden="true" dir="ltr" className="absolute end-6 top-5 z-20 text-5xl font-extralight text-white/[0.14] sm:text-7xl">01</div>
          <div className="absolute bottom-0 start-0 z-30 w-full border-t border-white/20 bg-stone-950/25 px-5 py-4 backdrop-blur-xl sm:px-9 sm:py-6">
            <div aria-hidden="true" dir="ltr" className="flex items-center justify-between gap-5 text-xs font-semibold text-white">
              <div className="flex items-center gap-3"><span>IR</span><span className="h-px w-8 bg-white/35" /><span className="text-emerald-200">→</span><span>INTL</span></div>
              <span className="hidden tracking-[0.25em] text-white/50 sm:inline">YOLPOL</span>
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className={`${styles.floatingCard} absolute start-0 top-[13%] z-30 hidden border border-stone-950/10 bg-[#f3f1eb]/80 px-5 py-4 shadow-[0_24px_70px_-30px_rgba(28,25,23,0.45)] backdrop-blur-2xl xl:block`}>
        <span dir={model.isRtl ? "rtl" : "ltr"} className="text-[9px] font-semibold text-stone-500">{model.networkLabel}</span>
        <div dir="ltr" className="mt-3 flex items-center gap-3 text-xl"><span>IR</span><span className="h-px w-8 bg-stone-950/20" /><span className="text-emerald-800">→</span><span className="text-stone-400">INTL</span></div>
      </div>
      <div aria-hidden="true" dir="ltr" className={`absolute bottom-[5%] z-30 hidden items-end gap-3 xl:flex ${model.isRtl ? "start-[1%]" : "end-[1%]"}`}>
        <span dir={model.isRtl ? "rtl" : "ltr"} className="text-[9px] text-stone-400">{model.technicalIndex}</span><span className="text-7xl font-extralight text-stone-950/[0.10]">01</span>
      </div>
    </div>
  );
}

function HomeHeroOrbits() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 size-[min(105vw,850px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-950/[0.08] border-t-emerald-800/60 animate-[spin_28s_linear_infinite] motion-reduce:animate-none" />
      <div className="absolute left-1/2 top-1/2 size-[min(88vw,700px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-950/[0.06] border-b-stone-950/25 animate-[spin_38s_linear_infinite] [animation-direction:reverse] motion-reduce:animate-none" />
      <div className="absolute left-1/2 top-1/2 size-[min(70vw,580px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-900/[0.18] animate-[spin_18s_linear_infinite] motion-reduce:animate-none" />
      <div className="absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-stone-950/[0.07] to-transparent" />
      <div className="absolute start-[4%] top-1/2 h-px w-[92%] -translate-y-1/2 bg-gradient-to-r from-transparent via-stone-950/[0.07] to-transparent" />
    </div>
  );
}

function FrameCorners() {
  return <div aria-hidden="true"><span className="absolute start-5 top-5 size-10 border-s border-t border-white/70" /><span className="absolute end-5 top-5 size-10 border-e border-t border-white/70" /><span className="absolute bottom-5 start-5 size-10 border-b border-s border-white/70" /><span className="absolute bottom-5 end-5 size-10 border-b border-e border-white/70" /></div>;
}
