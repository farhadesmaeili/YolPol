"use client";

import {useEffect, useRef, useState} from "react";

import {Link, usePathname} from "@/i18n/navigation";
import type {Locale} from "@/shared/types/locale";

export type NavigationItem = Readonly<{id: string; href: string; label: string}>;

export function SiteNavigation({
  items,
  locale,
  locales,
  labels,
}: {
  items: readonly NavigationItem[];
  locale: Locale;
  locales: readonly Readonly<{id: Locale; label: string}>[];
  labels: Readonly<{primary: string; openMenu: string; closeMenu: string; languages: string}>;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);
  const activeHref = items
    .filter((item) => item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  const links = (
    <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setIsOpen(false)}
              className="block min-h-11 px-3 py-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus aria-[current=page]:text-brand aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const localeLinks = (
    <div aria-label={labels.languages} className="flex flex-wrap items-center gap-1">
      {locales.map((candidate) => (
        <Link
          key={candidate.id}
          href={pathname}
          locale={candidate.id}
          hrefLang={candidate.id}
          aria-current={candidate.id === locale ? "page" : undefined}
          onClick={() => setIsOpen(false)}
          className="inline-flex min-h-10 min-w-10 items-center justify-center border border-border px-2 text-xs font-semibold uppercase text-muted-foreground outline-none hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-focus aria-[current=page]:border-brand aria-[current=page]:bg-brand aria-[current=page]:text-white"
        >
          <span className="sr-only">{candidate.label}</span>
          <span aria-hidden="true">{candidate.id}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls="mobile-site-navigation"
        aria-label={isOpen ? labels.closeMenu : labels.openMenu}
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus lg:hidden"
      >
        <span aria-hidden="true" className="text-xl">{isOpen ? "×" : "☰"}</span>
      </button>
      <nav aria-label={labels.primary} className="hidden items-center gap-4 lg:flex">
        {links}
        {localeLinks}
      </nav>
      {isOpen ? (
        <nav id="mobile-site-navigation" aria-label={labels.primary} className="absolute inset-x-0 top-full z-50 border-y border-border bg-surface px-6 py-5 shadow-lg lg:hidden">
          <div className="mx-auto max-w-6xl">{links}<div className="mt-4 border-t border-border pt-4">{localeLinks}</div></div>
        </nav>
      ) : null}
    </>
  );
}
