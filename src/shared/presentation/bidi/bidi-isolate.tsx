import type {ReactNode} from "react";

import type {Locale} from "@/shared/types/locale";

export function LtrIsolate({children, className = ""}: {children: ReactNode; className?: string}) {
  return <bdi dir="ltr" className={`inline-block [unicode-bidi:isolate] ${className}`.trim()}>{children}</bdi>;
}

export function formatHumanNumber(locale: Locale, value: number): string {
  if (!Number.isFinite(value)) return "—";
  const numberLocale = locale === "fa" ? "fa-u-nu-arabext" : locale === "ar" ? "ar-u-nu-arab" : locale;
  return new Intl.NumberFormat(numberLocale).format(value);
}

export function NumberUnit({locale, value, unit}: {locale: Locale; value: number; unit: string}) {
  return <span className="inline-block whitespace-nowrap [unicode-bidi:isolate]">{formatHumanNumber(locale, value)} {unit}</span>;
}
