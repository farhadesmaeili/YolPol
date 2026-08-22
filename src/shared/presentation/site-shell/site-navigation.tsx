"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Link, usePathname } from "@/i18n/navigation";
import {
  getContainedFocusIndex,
  resolveActiveNavigationHref,
} from "@/shared/presentation/site-shell/site-navigation-behavior";
import type { NavigationItem } from "@/shared/presentation/site-shell/site-navigation-behavior";
import type { Locale } from "@/shared/types/locale";
import {MobileMenuTrigger} from "@/shared/presentation/site-shell/mobile-menu-trigger";

export type { NavigationItem } from "@/shared/presentation/site-shell/site-navigation-behavior";

type SiteNavigationProps = Readonly<{
  items: readonly NavigationItem[];
  locale: Locale;
  locales: readonly Readonly<{ id: Locale; label: string }>[];
  labels: Readonly<{
    primary: string;
    openMenu: string;
    closeMenu: string;
    languages: string;
  }>;
}>;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SiteNavigation({ items, locale, locales, labels }: SiteNavigationProps) {
  const pathname = usePathname();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = "mobile-site-navigation";
  const isOpen = openPathname === pathname;
  const isRtl = locale === "fa" || locale === "ar";
  const activeHref = resolveActiveNavigationHref(pathname, items);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const focusSelector = 'a[href], button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

    function getFocusableElements() {
      const panelElements = panelRef.current
        ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusSelector))
        : [];
      return triggerRef.current ? [triggerRef.current, ...panelElements] : panelElements;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenPathname(null);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      const targetIndex = getContainedFocusIndex(
        currentIndex,
        focusableElements.length,
        event.shiftKey,
      );
      if (targetIndex === undefined) return;

      event.preventDefault();
      focusableElements[targetIndex]?.focus();
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function closeMenu() {
    setOpenPathname(null);
  }

  function closeMenuAndRestoreFocus() {
    closeMenu();
    triggerRef.current?.focus();
  }

  function toggleMenu() {
    setOpenPathname((current) => current === pathname ? null : pathname);
  }

  function renderNavigationLinks(mobile: boolean) {
    return (
      <ul className={cn("flex", mobile ? "flex-col" : "items-center gap-0.5")}>
        {items.map((item, index) => {
          const active = item.href === activeHref;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={closeMenu}
                className={cn(
                  "group relative flex min-h-12 items-center gap-3 text-start font-medium text-stone-600 outline-none transition-colors duration-300 hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2 aria-[current=page]:text-stone-950 motion-reduce:transition-none",
                  mobile
                    ? "px-4 text-sm"
                    : "whitespace-nowrap px-1.5 text-[11px] min-[1440px]:px-2 min-[1440px]:text-xs min-[1600px]:text-sm",
                )}
              >
                {mobile ? (
                  <span aria-hidden="true" dir="ltr" className="w-5 shrink-0 text-[8px] font-semibold tracking-[0.18em] text-stone-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                ) : null}
                <span>{item.label}</span>
                {mobile ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "ms-auto size-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none",
                      active ? "bg-emerald-800 opacity-100" : "bg-stone-950/20 opacity-0 group-hover:opacity-100",
                    )}
                  />
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-1.5 bottom-1 h-px origin-center transition-transform duration-500 ease-out motion-reduce:transition-none min-[1440px]:inset-x-2",
                        active ? "scale-x-100 bg-emerald-800" : "scale-x-0 bg-stone-950/40 group-hover:scale-x-100",
                      )}
                    />
                    {active ? <span aria-hidden="true" className="absolute bottom-[-4px] start-1/2 size-2 -translate-x-1/2 rounded-full border border-[#f3f1eb] bg-emerald-800 shadow-[0_0_10px_rgba(6,78,59,0.25)]" /> : null}
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderLocaleLinks() {
    return (
      <div aria-label={labels.languages} className="flex max-w-full flex-wrap items-center gap-1">
        {locales.map((candidate) => {
          const active = candidate.id === locale;
          return (
            <Link
              key={candidate.id}
              href={pathname}
              locale={candidate.id}
              hrefLang={candidate.id}
              aria-current={active ? "page" : undefined}
              onClick={closeMenu}
              className={cn(
                "group relative inline-flex min-h-11 min-w-11 items-center justify-center overflow-hidden border px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2 motion-reduce:transition-none",
                active
                  ? "border-emerald-900 bg-emerald-900 text-white"
                  : "border-stone-950/10 bg-white/25 text-stone-500 hover:border-emerald-900/30 hover:bg-white/60 hover:text-emerald-950",
              )}
            >
              <span className="sr-only">{candidate.label}</span>
              <span aria-hidden="true" dir="ltr" className="relative z-10">{candidate.id}</span>
              {!active ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px origin-center scale-x-0 bg-emerald-800 transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none" /> : null}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <MobileMenuTrigger buttonRef={triggerRef} panelId={panelId} isOpen={isOpen} openLabel={labels.openMenu} closeLabel={labels.closeMenu} onToggle={toggleMenu} />

      <nav aria-label={labels.primary} className="hidden min-w-0 items-center gap-2 xl:flex min-[1440px]:gap-3">
        {renderNavigationLinks(false)}
        <span aria-hidden="true" className="h-7 w-px bg-stone-950/10" />
        {renderLocaleLinks()}
      </nav>

      {isOpen ? createPortal(
        <div className="pointer-events-auto fixed inset-0 z-40 xl:hidden" data-mobile-navigation-overlay="open">
          <button
            type="button"
            tabIndex={-1}
            aria-label={labels.closeMenu}
            onClick={closeMenuAndRestoreFocus}
            className="pointer-events-auto absolute inset-0 top-[88px] cursor-default bg-stone-950/10 xl:hidden"
          />
          <nav
            ref={panelRef}
            id={panelId}
            aria-label={labels.primary}
            dir={isRtl ? "rtl" : "ltr"}
            className="pointer-events-auto absolute inset-x-0 top-[88px] z-10 max-h-[calc(100svh-88px)] max-w-full overflow-y-auto overscroll-contain border-b border-stone-950/10 bg-[#f3f1eb] shadow-[0_40px_80px_-45px_rgba(28,25,23,0.45)] xl:hidden"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -end-32 -top-32 size-80 rounded-full bg-emerald-700/[0.08] blur-[100px]" />
              <div className="absolute -start-32 bottom-[-10rem] size-72 rounded-full bg-[#d8c7a3]/25 blur-[110px]" />
              <div dir="ltr" className="absolute bottom-[-2rem] start-1/2 max-w-full -translate-x-1/2 overflow-hidden whitespace-nowrap text-[clamp(4rem,28vw,8rem)] font-black tracking-[-0.08em] text-stone-950/[0.025]">YOLPOL</div>
              <div className="absolute -end-28 top-16 size-64 max-w-[70vw]">
                <div className="absolute inset-0 animate-[spin_26s_linear_infinite] rounded-full border border-stone-950/[0.06] border-t-emerald-800/30 motion-reduce:animate-none">
                  <span className="absolute start-1/2 top-[-4px] size-2 -translate-x-1/2 rounded-full bg-emerald-800" />
                </div>
                <div className="absolute inset-[22%] animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-stone-950/[0.06] [animation-direction:reverse] motion-reduce:animate-none" />
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[1900px] px-4 py-8 sm:px-10">
              <div className="mb-6 flex items-center justify-between gap-4 border-b border-stone-950/[0.08] pb-5">
                <div aria-hidden="true" dir="ltr" className="flex items-center gap-3">
                  <span className="relative flex size-2">
                    <span className="absolute size-full animate-ping rounded-full bg-emerald-800 opacity-20 motion-reduce:animate-none" />
                    <span className="relative size-2 rounded-full bg-emerald-800" />
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-stone-500">YOLPOL</span>
                </div>
                <span aria-hidden="true" dir="ltr" className="shrink-0 text-[9px] font-medium uppercase tracking-[0.2em] text-stone-400">IR / INTL</span>
              </div>
              {renderNavigationLinks(true)}
              <div className="mt-8 border-t border-stone-950/[0.08] pt-6">
                <div className="mb-4 flex items-center gap-3">
                  <span aria-hidden="true" className="h-px w-7 bg-emerald-900/40" />
                  <span className="text-xs font-medium text-stone-500">{labels.languages}</span>
                </div>
                {renderLocaleLinks()}
              </div>
              <div aria-hidden="true" dir="ltr" className="mt-8 flex items-center justify-between gap-4 border-t border-stone-950/[0.08] pt-5 text-[8px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                <span>YOLPOL</span>
                <div className="flex items-center gap-2"><span>IR</span><span className="h-px w-5 bg-stone-950/15" /><span>B2B</span><span className="h-px w-5 bg-stone-950/15" /><span>INTL</span></div>
              </div>
            </div>
          </nav>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
