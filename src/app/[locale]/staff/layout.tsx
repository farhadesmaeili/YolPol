import type {Metadata} from "next";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import type {ReactNode} from "react";

import {getLocaleDirection} from "@/i18n/locale";
import {routing, type Locale} from "@/i18n/routing";
import {getLocaleFontClass} from "@/shared/presentation/typography/locale-font";
import "../../globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {index: false, follow: false, nocache: true},
};

type StaffRootLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{locale: string}>;
}>;

export default async function StaffRootLayout({children, params}: StaffRootLayoutProps) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={getLocaleDirection(locale as Locale)}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className={`${getLocaleFontClass(locale as Locale)} min-h-screen bg-background text-foreground antialiased`}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
