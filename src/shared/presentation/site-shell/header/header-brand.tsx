import Image from "next/image";

import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/shared/config/site";

export function HeaderBrand({ homeLabel }: { homeLabel: string }) {
  return (
    <Link
      href="/"
      aria-label={homeLabel}
      className="group relative flex min-w-0 shrink items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb] sm:gap-4"
    >
      <div className="relative flex size-14 shrink-0 items-center justify-center">
        <div
          aria-hidden="true"
          className="absolute -inset-1.5 animate-[spin_18s_linear_infinite] rounded-full border border-transparent border-t-emerald-800/35 opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:animate-none motion-reduce:transition-none"
        >
          <span className="absolute start-1/2 top-[-2px] size-1.5 -translate-x-1/2 rounded-full bg-emerald-800" />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 border border-stone-950/10 bg-white/35 shadow-[0_10px_35px_-20px_rgba(28,25,23,0.4)] backdrop-blur-xl transition-all duration-500 group-hover:border-emerald-900/25 group-hover:bg-white/60 motion-reduce:transition-none"
        />
        <span aria-hidden="true" className="absolute start-0 top-0 h-3 w-3 border-s border-t border-emerald-900/40" />
        <span aria-hidden="true" className="absolute end-0 top-0 h-3 w-3 border-e border-t border-emerald-900/40" />
        <span aria-hidden="true" className="absolute bottom-0 start-0 h-3 w-3 border-b border-s border-emerald-900/40" />
        <span aria-hidden="true" className="absolute bottom-0 end-0 h-3 w-3 border-b border-e border-emerald-900/40" />
        <Image
          src={siteConfig.logoPath}
          alt=""
          width={48}
          height={48}
          priority
          className="relative z-10 size-11 object-contain transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
        />
      </div>

      <div className="flex min-w-0 flex-col">
        <div dir="ltr" className="flex items-center gap-2.5">
          <span className="truncate text-[23px] font-semibold leading-none tracking-[-0.045em] text-stone-950">
            {siteConfig.identity.brandName}
          </span>
          <span aria-hidden="true" className="relative hidden size-2 sm:flex">
            <span className="absolute size-full animate-ping rounded-full bg-emerald-700 opacity-20 motion-reduce:animate-none" />
            <span className="relative size-2 rounded-full bg-emerald-800" />
          </span>
        </div>
        <div aria-hidden="true" dir="ltr" className="mt-1.5 hidden items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.26em] text-stone-400 sm:flex">
          <span>{siteConfig.brandDescriptor[0]}</span><span className="h-px w-5 bg-stone-950/15" /><span>{siteConfig.brandDescriptor[1]}</span><span className="h-px w-5 bg-stone-950/15" /><span>{siteConfig.brandDescriptor[2]}</span>
        </div>
      </div>
    </Link>
  );
}
