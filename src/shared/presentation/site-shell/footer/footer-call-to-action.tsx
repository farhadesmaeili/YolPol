import { Link } from "@/i18n/navigation";

export function FooterCallToAction({
  description,
  inquiryLabel,
  isRtl,
}: {
  description: string;
  inquiryLabel: string;
  isRtl: boolean;
}) {
  return (
    <div className="relative z-10 border-b border-stone-950/[0.09]">
      <div className="mx-auto grid w-full max-w-[1900px] gap-10 px-4 py-14 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-14 lg:py-20 xl:px-20 min-[1600px]:px-24">
        <div className="min-w-0 max-w-5xl text-start">
          <div aria-hidden="true" className="mb-6 flex items-center gap-4">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-700 opacity-20 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-800 shadow-[0_0_18px_rgba(6,78,59,0.3)]" />
            </span>
            <span className="h-px w-12 bg-emerald-900/40" />
            <span dir="ltr" className="text-[9px] font-semibold uppercase tracking-[0.28em] text-stone-500">YOLPOL / IR</span>
          </div>
          <p dir="ltr" className="text-[clamp(3.4rem,8vw,9rem)] font-semibold leading-[0.8] tracking-[-0.085em] text-stone-950">YOLPOL</p>
          <p className="mt-7 max-w-3xl text-base leading-8 text-stone-600 sm:text-lg sm:leading-9">{description}</p>
        </div>

        <Link href="/inquiry" className="group relative inline-flex min-h-16 max-w-full items-stretch self-start overflow-hidden border border-emerald-950/20 bg-emerald-950 text-white shadow-[0_20px_55px_-32px_rgba(6,78,59,0.65)] outline-none transition-[background-color,box-shadow] duration-500 hover:bg-emerald-900 hover:shadow-[0_24px_65px_-30px_rgba(6,78,59,0.7)] focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb] motion-reduce:transition-none lg:self-auto">
          <span className="relative z-10 flex min-w-0 items-center px-5 text-sm font-semibold sm:px-8">{inquiryLabel}</span>
          <span aria-hidden="true" className="relative z-10 flex w-16 shrink-0 items-center justify-center border-s border-white/15 bg-emerald-200 text-xl text-emerald-950 transition-colors duration-500 group-hover:bg-emerald-100 motion-reduce:transition-none">
            {isRtl ? "←" : "→"}
          </span>
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-emerald-300/70" />
        </Link>
      </div>
    </div>
  );
}
