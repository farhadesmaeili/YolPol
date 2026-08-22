import { getTranslations } from "next-intl/server";

import { primaryNavigation } from "@/shared/config/site";
import { HeaderBackground } from "@/shared/presentation/site-shell/header/header-background";
import { HeaderBrand } from "@/shared/presentation/site-shell/header/header-brand";
import { SiteNavigation } from "@/shared/presentation/site-shell/site-navigation";
import { supportedLocales, type Locale } from "@/shared/types/locale";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const translations = await getTranslations({ locale, namespace: "SiteShell" });
  const isRtl = locale === "fa" || locale === "ar";
  const items = primaryNavigation.map(({ id, href }) => ({
    id,
    href,
    label: translations(`navigation.${id}`),
  }));
  const locales = supportedLocales.map((id) => ({
    id,
    label: translations(`locales.${id}`),
  }));

  return (
    <header
      dir={isRtl ? "rtl" : "ltr"}
      className="sticky top-0 z-50 border-b border-stone-950/[0.08] bg-[linear-gradient(135deg,rgba(243,241,235,0.96)_0%,rgba(248,247,242,0.93)_42%,rgba(231,240,233,0.90)_72%,rgba(243,241,235,0.95)_100%)] text-stone-950 shadow-[0_10px_40px_-28px_rgba(6,78,59,0.28)] backdrop-blur-2xl"
    >
      <HeaderBackground />

      <div className="relative mx-auto flex min-h-[88px] w-full max-w-[1900px] items-center justify-between gap-3 px-4 sm:gap-6 sm:px-10 lg:px-8 xl:px-6 min-[1440px]:px-10 min-[1600px]:px-14">
        <HeaderBrand homeLabel={translations("homeLabel")} />

        <div aria-hidden="true" className="pointer-events-none absolute start-1/2 top-0 hidden h-full -translate-x-1/2 items-center xl:flex">
          <div className="relative flex h-full items-center">
            <span className="absolute start-1/2 top-0 h-3 w-px -translate-x-1/2 bg-stone-950/10" />
            <span className="size-1.5 rounded-full border border-emerald-900/30 bg-[#f3f1eb]" />
          </div>
        </div>

        <div className="relative z-20 flex min-w-0 shrink-0 items-center gap-5">
          <div aria-hidden="true" dir="ltr" className="hidden items-center gap-3 border-e border-stone-950/10 pe-4 min-[1600px]:flex">
            <span className="relative flex size-2">
              <span className="absolute size-full animate-ping rounded-full bg-emerald-700 opacity-20 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-emerald-800" />
            </span>
            <span className="text-[8px] font-semibold uppercase tracking-[0.25em] text-stone-400">IR / B2B</span>
          </div>
          <SiteNavigation
            items={items}
            locale={locale}
            locales={locales}
            labels={{
              primary: translations("primaryLabel"),
              openMenu: translations("openMenu"),
              closeMenu: translations("closeMenu"),
              languages: translations("languagesLabel"),
            }}
          />
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-stone-950/[0.10] to-transparent" />
    </header>
  );
}
