"use client";

import {useLayoutEffect, useRef, useState} from "react";
import {MessageItem} from "@/features/inquiries/presentation/components/customer-chat/message-item";
import {CustomerChatScroll, restoreChatReadingAnchor, type ChatReadingAnchor} from "@/features/inquiries/presentation/state/customer-chat-scroll";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export function MessageList({messages, label, empty, customerAuthor, supportAuthor, newMessages, locale = "en", ready = true}: {messages: readonly CustomerChatMessage[]; label: string; empty: string; customerAuthor: string; supportAuthor: string; newMessages?: string; locale?: string; ready?: boolean}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const controllerRef = useRef<CustomerChatScroll | null>(null);
  const anchorRef = useRef<ChatReadingAnchor | null>(null);
  const lastHeight = useRef(0);
  const lastClientHeight = useRef(0);
  const [unread, setUnread] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const controller = new CustomerChatScroll(viewport, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, setUnread);
    controllerRef.current = controller;
    const rememberAnchor = () => {
      const top = viewport.getBoundingClientRect().top;
      const element = Array.from(content.children).find((child) => child.getBoundingClientRect().bottom > top);
      anchorRef.current = element instanceof HTMLElement ? {element, offset: element.getBoundingClientRect().top - top} : null;
    };
    const onScroll = () => { controller.onScroll(); rememberAnchor(); };
    const onUserScroll = () => controller.onUserScroll();
    viewport.addEventListener("scroll", onScroll, {passive: true});
    viewport.addEventListener("wheel", onUserScroll, {passive: true});
    viewport.addEventListener("touchstart", onUserScroll, {passive: true});
    viewport.addEventListener("pointerdown", onUserScroll, {passive: true});
    viewport.addEventListener("keydown", onUserScroll);
    const observer = new ResizeObserver(() => {
      if (viewport.scrollHeight === lastHeight.current && viewport.clientHeight === lastClientHeight.current) return;
      lastHeight.current = viewport.scrollHeight;
      lastClientHeight.current = viewport.clientHeight;
      if (controller.isFollowing) controller.onResize();
      else restoreChatReadingAnchor(viewport, anchorRef.current);
      rememberAnchor();
    });
    observer.observe(content);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onUserScroll);
      viewport.removeEventListener("touchstart", onUserScroll);
      viewport.removeEventListener("pointerdown", onUserScroll);
      viewport.removeEventListener("keydown", onUserScroll);
      observer.disconnect(); controllerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const controller = controllerRef.current;
    if (!viewport || !controller) return;
    // Preserve the visible message when a repaired earlier position is inserted.
    if (!controller.isFollowing) restoreChatReadingAnchor(viewport, anchorRef.current);
    controller.reconcile(messages.map(({id}) => id), ready);
    lastHeight.current = viewport.scrollHeight;
    lastClientHeight.current = viewport.clientHeight;
  }, [messages, ready]);

  return <div className="relative min-w-0">
    <div ref={viewportRef} role="log" aria-live={ready ? "polite" : "off"} aria-relevant="additions" aria-label={label} tabIndex={0} className="chat-viewport min-h-64 min-w-0 overflow-y-auto overscroll-y-contain bg-background/60 px-3 py-5 outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:px-6">
      <ol ref={contentRef} className="space-y-4">
        {ready && messages.length === 0 ? <li className="flex min-h-48 flex-col items-center justify-center gap-4 px-5 text-center"><svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" className="size-10 text-brand/60"><path d="M5 5h22v17H14l-7 5v-5H5zM10 11h12M10 16h8" /></svg><p className="max-w-xs text-sm leading-7 text-muted-foreground">{empty}</p></li> : messages.map((message) => <MessageItem key={message.id} message={message} locale={locale} author={message.sender === "customer" ? customerAuthor : supportAuthor} />)}
      </ol>
    </div>
    {unread > 0 ? <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3"><button type="button" onClick={() => controllerRef.current?.latest()} className="inquiry-reveal pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-brand/20 bg-surface px-5 text-sm font-semibold text-brand shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-focus"><span aria-hidden="true">↓</span>{newMessages}<span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{new Intl.NumberFormat(locale).format(unread)}</span></button></div> : null}
  </div>;
}
