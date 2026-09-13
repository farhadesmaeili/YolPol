import Image from "next/image";

import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/shared/config/site";

const footerLinkClass =
  "group relative inline-flex min-h-11 items-center gap-3 text-sm text-stone-600 outline-none transition-colors duration-300 hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb] motion-reduce:transition-none";

export function FooterBrand({ homeLabel, legalItems }: { homeLabel: string; legalItems: readonly Readonly<{ href: string; label: string }>[] }) {
  return (
    <section className="min-w-0 max-w-md text-start">
      <Link href="/" aria-label={homeLabel} className="group inline-flex max-w-full items-center gap-4 outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb]">
        <div className="relative flex size-14 shrink-0 items-center justify-center border border-stone-950/10 bg-white/30 backdrop-blur-xl">
          <span aria-hidden="true" className="absolute start-0 top-0 h-3 w-3 border-s border-t border-emerald-900/40" />
          <span aria-hidden="true" className="absolute end-0 top-0 h-3 w-3 border-e border-t border-emerald-900/40" />
          <span aria-hidden="true" className="absolute bottom-0 start-0 h-3 w-3 border-b border-s border-emerald-900/40" />
          <span aria-hidden="true" className="absolute bottom-0 end-0 h-3 w-3 border-b border-e border-emerald-900/40" />
          <Image src={siteConfig.logoPath} alt="" width={48} height={48} className="size-11 object-contain transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none" />
        </div>
        <div aria-hidden="true" className="min-w-0">
          <p dir="ltr" className="truncate text-2xl font-semibold tracking-[-0.045em]">{siteConfig.identity.brandName}</p>
          <div dir="ltr" className="mt-2 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.28em] text-stone-400">
            <span>{siteConfig.brandDescriptor[0]}</span><span className="h-px w-5 bg-stone-950/20" /><span>{siteConfig.brandDescriptor[1]}</span><span className="h-px w-5 bg-stone-950/20" /><span>{siteConfig.brandDescriptor[2]}</span>
          </div>
        </div>
      </Link>
      <div aria-hidden="true" className="mt-7 flex items-center gap-3">
        <span className="size-1.5 rounded-full bg-emerald-800" />
        <span className="h-px w-16 bg-gradient-to-r from-emerald-800/60 to-transparent" />
      </div>
      <ul className="mt-5 space-y-1">
        {legalItems.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className={footerLinkClass}>
              <span aria-hidden="true" className="h-px w-4 bg-stone-950/25 transition-all duration-300 group-hover:w-7 group-hover:bg-emerald-800 motion-reduce:transition-none" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
