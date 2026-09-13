import { siteConfig } from "@/shared/config/site";
import { LtrIsolate } from "@/shared/presentation/bidi/bidi-isolate";

export function FooterExportStrip({ designedBy, rights }: { designedBy: string; rights: string }) {
  return (
    <>
      <div className="relative overflow-hidden border-y border-stone-950/[0.09] py-6">
        <div aria-hidden="true" className="pointer-events-none absolute start-0 top-1/2 h-px w-full -translate-y-1/2 bg-gradient-to-r from-transparent via-emerald-800/[0.12] to-transparent" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div aria-hidden="true" dir="ltr" className="flex items-center gap-4">
            <span className="relative flex size-2.5">
              <span className="absolute size-full animate-ping rounded-full bg-emerald-800 opacity-15 motion-reduce:animate-none" />
              <span className="relative size-2.5 rounded-full bg-emerald-800" />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-stone-500">YOLPOL / IR</span>
          </div>
          <div aria-hidden="true" dir="ltr" className="flex max-w-full flex-wrap items-center gap-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-stone-500 sm:gap-4">
            <span>IR</span><span className="h-px w-8 bg-stone-950/20" /><span className="text-emerald-800">→</span><span>TR</span><span className="size-1 rounded-full bg-stone-950/20" /><span>GCC</span><span className="size-1 rounded-full bg-stone-950/20" /><span>INTL</span>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col gap-4 py-7 text-start sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs text-stone-500">© {new Date().getFullYear()} {siteConfig.identity.publicName}. {rights}</p>
          <p className="text-[10px] text-stone-400">
            {designedBy}{" "}
            <a
              href={siteConfig.designer.emailHref}
              className="outline-none transition-colors hover:text-stone-600 focus-visible:ring-2 focus-visible:ring-emerald-800 motion-reduce:transition-none"
            >
              <LtrIsolate>{siteConfig.designer.name}</LtrIsolate>
            </a>
          </p>
        </div>
        <div aria-hidden="true" dir="ltr" className="flex max-w-full flex-wrap items-center gap-3 text-[8px] font-semibold uppercase tracking-[0.25em] text-stone-400">
          <span>IR</span><span className="h-px w-6 bg-stone-950/15" /><span>B2B</span><span className="h-px w-6 bg-stone-950/15" /><span>WHOLESALE</span><span className="h-px w-6 bg-stone-950/15" /><span>SUPPLY</span>
        </div>
      </div>
    </>
  );
}
