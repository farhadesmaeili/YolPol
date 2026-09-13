export const customerChatNearBottomPx = 96;

export interface ChatScrollViewport {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollTo(options: ScrollToOptions): void;
}

export type ChatReadingAnchor = Readonly<{element: Pick<HTMLElement, "isConnected" | "getBoundingClientRect">; offset: number}>;

export function restoreChatReadingAnchor(viewport: Pick<HTMLElement, "scrollTop" | "getBoundingClientRect">, anchor: ChatReadingAnchor | null): void {
  if (anchor?.element.isConnected) viewport.scrollTop += anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
}

/** Presentation-only identity tracking. Delivery positions remain owned by the chat reducer. */
export class CustomerChatScroll {
  private ids = new Set<string>();
  private unread = new Set<string>();
  private initialized = false;
  private following = true;
  private smoothTarget: number | null = null;

  constructor(private readonly viewport: ChatScrollViewport, private readonly reducedMotion: () => boolean, private readonly announce: (count: number) => void) {}

  onScroll(): void {
    if (this.smoothTarget !== null) {
      if (Math.abs(this.viewport.scrollTop - this.smoothTarget) > 1) return;
      this.smoothTarget = null;
    }
    this.following = this.viewport.scrollHeight - this.viewport.clientHeight - this.viewport.scrollTop <= customerChatNearBottomPx;
    if (this.following) this.clearUnread();
  }

  onUserScroll(): void { this.smoothTarget = null; }

  reconcile(ids: readonly string[], ready: boolean): void {
    if (!ready) return;
    const added = ids.filter((id) => !this.ids.has(id));
    this.ids = new Set(ids);
    if (!this.initialized) {
      this.initialized = true;
      if (this.following) this.scroll("auto");
      return;
    }
    if (!added.length) return;
    if (this.following) this.scroll(this.reducedMotion() ? "auto" : "smooth");
    else {
      added.forEach((id) => this.unread.add(id));
      this.announce(this.unread.size);
    }
  }

  onResize(): void {
    if (this.initialized && this.following) this.scroll("auto");
  }

  latest(): void {
    this.following = true;
    this.clearUnread();
    this.scroll(this.reducedMotion() ? "auto" : "smooth");
  }

  get isFollowing(): boolean { return this.following; }

  private clearUnread(): void {
    if (!this.unread.size) return;
    this.unread.clear();
    this.announce(0);
  }

  private scroll(behavior: ScrollBehavior): void {
    const top = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
    this.smoothTarget = behavior === "smooth" ? top : null;
    this.viewport.scrollTo({top, behavior});
  }
}
