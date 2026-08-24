import { getTranslations } from "next-intl/server";

import {
  legalNavigation,
  primaryNavigation,
  publicProductCategories,
} from "@/shared/config/site";
import { FooterBackground } from "@/shared/presentation/site-shell/footer/footer-background";
import { FooterBrand } from "@/shared/presentation/site-shell/footer/footer-brand";
import { FooterCallToAction } from "@/shared/presentation/site-shell/footer/footer-call-to-action";
import { FooterContact } from "@/shared/presentation/site-shell/footer/footer-contact";
import { FooterExportStrip } from "@/shared/presentation/site-shell/footer/footer-export-strip";
import { FooterLinkColumn } from "@/shared/presentation/site-shell/footer/footer-link-column";
import type { Locale } from "@/shared/types/locale";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "SiteShell" });
  const isRtl = locale === "fa" || locale === "ar";
  const navigationItems = primaryNavigation.filter(
    ({ id }) =>
      !publicProductCategories.some((category) => category.id === id),
  );

  return (
    <footer
      dir={isRtl ? "rtl" : "ltr"}
      className="relative isolate overflow-hidden border-t border-stone-950/[0.08] bg-[#f3f1eb] text-stone-950"
    >
      <FooterBackground />
      <FooterCallToAction
        description={t("footer.description")}
        contactLabel={t("footer.contact")}
        isRtl={isRtl}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1900px] px-4 sm:px-10 lg:px-14 xl:px-20 min-[1600px]:px-24">
        <div className="grid gap-12 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_1.2fr] lg:gap-10 lg:py-20 xl:gap-12">
          <FooterBrand
            homeLabel={t("homeLabel")}
            legalItems={legalNavigation.map(({ id, href }) => ({
              href,
              label: t(`footer.${id}`),
            }))}
          />
          <FooterLinkColumn
            id="footer-navigation"
            index="01"
            heading={t("footer.navigation")}
            isRtl={isRtl}
            items={navigationItems.map(({ id, href }) => ({
              href,
              label: t(`navigation.${id}`),
            }))}
          />
          <FooterLinkColumn
            id="footer-categories"
            index="02"
            heading={t("footer.categories")}
            isRtl={isRtl}
            items={publicProductCategories.map(({ id, href }) => ({
              href,
              label: t(`navigation.${id}`),
            }))}
          />
          <FooterContact
            isRtl={isRtl}
            locale={locale}
            labels={{
              heading: t("footer.contact"),
              whatsapp: t("contact.whatsapp"),
              location: t("contact.location"),
              instagram: t("social.instagram"),
              linkedin: t("social.linkedin"),
              telegram: t("social.telegram"),
            }}
          />
        </div>

        <FooterExportStrip rights={t("footer.rights")} />
      </div>

      <span aria-hidden="true" className="pointer-events-none absolute start-4 top-4 z-30 h-9 w-9 border-s border-t border-stone-950/15 sm:start-6 sm:top-6" />
      <span aria-hidden="true" className="pointer-events-none absolute end-4 top-4 z-30 h-9 w-9 border-e border-t border-stone-950/15 sm:end-6 sm:top-6" />
    </footer>
  );
}
