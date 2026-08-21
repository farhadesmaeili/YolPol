import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { primaryNavigation, siteConfig } from "@/shared/config/site";
import { SiteNavigation } from "@/shared/presentation/site-shell/site-navigation";
import { supportedLocales, type Locale } from "@/shared/types/locale";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const translations = await getTranslations({
    locale,
    namespace: "SiteShell",
  });
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
    <header className="relative z-40 border-b border-border bg-header">
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <Link
          href="/"
          aria-label={translations("homeLabel")}
          className="flex shrink-0 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Image
            src={siteConfig.logoPath}
            alt=""
            width={52}
            height={52}
            priority
            className="size-13"
          />
          <span className="text-xl font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>
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
    </header>
  );
}
