export type NavigationItem = Readonly<{
  id: string;
  href: string;
  label: string;
}>;

export function resolveActiveNavigationHref(
  pathname: string,
  items: readonly NavigationItem[],
): string | undefined {
  return items.reduce<string | undefined>((activeHref, item) => {
    const matches =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (!matches || (activeHref && activeHref.length >= item.href.length)) {
      return activeHref;
    }
    return item.href;
  }, undefined);
}

export function getContainedFocusIndex(
  currentIndex: number,
  focusableCount: number,
  movesBackward: boolean,
): number | undefined {
  if (focusableCount < 1) return undefined;
  if (movesBackward && currentIndex <= 0) return focusableCount - 1;
  if (!movesBackward && currentIndex >= focusableCount - 1) return 0;
  return undefined;
}
