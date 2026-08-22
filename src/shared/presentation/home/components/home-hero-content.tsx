import { Link } from "@/i18n/navigation";
import { HomeExportCapacityCard } from "@/shared/presentation/home/components/home-export-capacity-card";
import styles from "@/shared/presentation/home/styles/home-hero.module.css";
import type { HomeHeroViewModel } from "@/shared/presentation/home/view-models/home-hero-view-model";

export function HomeHeroContent({ model }: { model: HomeHeroViewModel }) {
  return (
    <div className={`relative z-30 py-6 lg:py-14 ${model.isRtl ? "text-end lg:order-2 lg:ps-8" : "text-start lg:order-1 lg:pe-8"}`}>
      <div className="mb-7 flex items-center gap-4">
        <span aria-hidden="true" className="h-px w-12 shrink-0 bg-emerald-900/60" />
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-800" />
        <p className={`text-emerald-950/70 ${model.isRtl ? "text-sm font-medium leading-7" : "text-[10px] font-semibold uppercase tracking-[0.3em]"}`}>{model.eyebrow}</p>
      </div>

      <h1 className={`relative z-40 text-stone-950 ${model.isRtl ? "max-w-[980px] text-[clamp(2.55rem,5.2vw,6rem)] font-semibold leading-[1.12]" : "max-w-[1050px] text-[clamp(3.25rem,6.5vw,8rem)] font-medium leading-[0.88] tracking-[-0.065em]"}`}>
        {model.heading}
      </h1>

      <div aria-hidden="true" dir="ltr" className={`mt-8 flex max-w-md items-center gap-4 ${model.isRtl ? "ms-auto" : ""}`}>
        <span className="size-2 rounded-full border border-emerald-800 bg-emerald-700/20" />
        <span className="relative h-px min-w-0 flex-1 overflow-hidden bg-stone-950/15"><span className={`${styles.route} absolute inset-y-0 start-0 w-[45%] bg-gradient-to-r from-transparent via-emerald-800/80 to-transparent`} /></span>
        <span className="text-emerald-800">→</span><span className="text-[9px] font-semibold tracking-[0.22em] text-stone-400">INTL</span>
      </div>

      <div className={`mt-8 max-w-2xl border-stone-950/15 ${model.isRtl ? "ms-auto border-e pe-5" : "border-s ps-5"}`}>
        <p className="max-w-xl text-base leading-8 text-stone-600 sm:text-lg sm:leading-9">{model.description}</p>
      </div>

      <div className={`mt-9 flex flex-wrap gap-3 sm:mt-11 sm:gap-4 ${model.isRtl ? "justify-end" : "justify-start"}`}>
        <Link href="/products" className="group inline-flex min-h-14 max-w-full items-stretch overflow-hidden border border-emerald-950/20 bg-emerald-950 text-white shadow-[0_20px_55px_-32px_rgba(6,78,59,0.65)] outline-none transition-[background-color,box-shadow] duration-500 hover:bg-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 motion-reduce:transition-none sm:min-h-16">
          <span className="flex min-w-0 items-center px-5 text-sm font-semibold sm:px-8">{model.productCta}</span>
          <span aria-hidden="true" className="flex w-14 shrink-0 items-center justify-center border-s border-white/15 bg-emerald-200 text-xl text-emerald-950 sm:w-16">{model.arrow}</span>
        </Link>
        <Link href="/contact" className="inline-flex min-h-14 items-center gap-4 border border-stone-950/20 bg-white/35 px-6 text-sm font-semibold text-stone-950 backdrop-blur-xl outline-none transition-colors duration-300 hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 motion-reduce:transition-none sm:min-h-16">
          {model.contactCta}<span aria-hidden="true" className="size-2 rounded-full bg-emerald-800" />
        </Link>
      </div>

      <div className={`mt-12 flex ${model.isRtl ? "justify-end" : "justify-start"}`}>
        <HomeExportCapacityCard model={model} />
      </div>
    </div>
  );
}
