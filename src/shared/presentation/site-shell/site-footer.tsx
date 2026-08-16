import {getTranslations} from "next-intl/server";

import {Link} from "@/i18n/navigation";
import {legalNavigation, primaryNavigation, publicProductCategories, siteConfig} from "@/shared/config/site";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

const externalLinkClass = "outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-accent";

export async function SiteFooter({locale}: {locale: Locale}) {
  const t = await getTranslations({locale, namespace: "SiteShell"});
  return (
    <footer className="bg-footer text-footer-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
        <section><h2 className="text-xl font-semibold">{siteConfig.name}</h2><p className="mt-4 max-w-sm text-sm leading-7 text-stone-300">{t("footer.description")}</p><ul className="mt-5 text-sm text-stone-300">{legalNavigation.map(({id, href}) => <li key={id}><Link href={href} className={externalLinkClass}>{t(`footer.${id}`)}</Link></li>)}</ul></section>
        <nav aria-labelledby="footer-navigation"><h2 id="footer-navigation" className="font-semibold">{t("footer.navigation")}</h2><ul className="mt-4 space-y-3 text-sm text-stone-300">{primaryNavigation.filter(({id}) => !publicProductCategories.some((category) => category.id === id)).map(({id, href}) => <li key={id}><Link href={href} className={externalLinkClass}>{t(`navigation.${id}`)}</Link></li>)}</ul></nav>
        <nav aria-labelledby="footer-categories"><h2 id="footer-categories" className="font-semibold">{t("footer.categories")}</h2><ul className="mt-4 space-y-3 text-sm text-stone-300">{publicProductCategories.map(({id, href}) => <li key={id}><Link href={href} className={externalLinkClass}>{t(`navigation.${id}`)}</Link></li>)}</ul></nav>
        <section><h2 className="font-semibold">{t("footer.contact")}</h2><address className="mt-4 space-y-3 text-sm not-italic text-stone-300"><p><a className={externalLinkClass} href={siteConfig.contact.emailHref}><LtrIsolate>{siteConfig.contact.email}</LtrIsolate></a></p><p><a className={externalLinkClass} href={siteConfig.contact.phoneHref}><LtrIsolate>{siteConfig.contact.phone}</LtrIsolate></a></p><p><a className={externalLinkClass} href={siteConfig.contact.whatsappHref} target="_blank" rel="noopener noreferrer">{t("contact.whatsapp")}: <LtrIsolate>{siteConfig.contact.whatsapp}</LtrIsolate></a></p><p>{t("contact.location")}: {siteConfig.contact.location}</p></address><ul className="mt-5 flex flex-wrap gap-4 text-sm"><li><a className={externalLinkClass} href={siteConfig.social.instagram} target="_blank" rel="noopener noreferrer" aria-label={t("social.instagram")}>Instagram</a></li><li><a className={externalLinkClass} href={siteConfig.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label={t("social.linkedin")}>LinkedIn</a></li><li><a className={externalLinkClass} href={siteConfig.social.telegram} target="_blank" rel="noopener noreferrer" aria-label={t("social.telegram")}>Telegram</a></li></ul></section>
      </div>
      <div className="border-t border-white/15 px-6 py-5 text-center text-xs text-stone-400">© {new Date().getFullYear()} {siteConfig.name}. {t("footer.rights")}</div>
    </footer>
  );
}
