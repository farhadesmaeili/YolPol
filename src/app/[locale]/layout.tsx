import type {Metadata} from "next";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import type {ReactNode} from "react";

import {getLocaleDirection} from "@/i18n/locale";
import {routing, type Locale} from "@/i18n/routing";
import {createLocalizedMetadata} from "@/shared/seo/metadata";
import {SiteFooter} from "@/shared/presentation/site-shell/site-footer";
import {SiteHeader} from "@/shared/presentation/site-shell/site-header";
import "../globals.css";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{locale: string}>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const translations = await getTranslations({locale, namespace: "Metadata"});

  return createLocalizedMetadata({
    locale,
    title: translations("title"),
    description: translations("description"),
  });
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={getLocaleDirection(locale as Locale)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <div className="flex min-h-screen flex-col">
            <SiteHeader locale={locale as Locale} />
            <main id="main-content" className="flex-1">{children}</main>
            <SiteFooter locale={locale as Locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
