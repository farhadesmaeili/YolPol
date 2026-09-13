import {describe, expect, it, vi} from "vitest";
import {CustomerChatScroll, restoreChatReadingAnchor} from "@/features/inquiries/presentation/state/customer-chat-scroll";
import {createInitialCustomerChatState, customerChatReducer} from "@/features/inquiries/presentation/state/customer-chat-reducer";

function setup(reduced = false) {
  const viewport = {scrollTop: 500, scrollHeight: 1000, clientHeight: 500, scrollTo: vi.fn()};
  const announce = vi.fn();
  const scroll = new CustomerChatScroll(viewport, () => reduced, announce);
  scroll.reconcile(["a"], true);
  viewport.scrollTo.mockClear();
  return {viewport, announce, scroll};
}

describe("Customer chat scroll behavior", () => {
  it("preserves the same visible message when a repaired message inserts 80px above it", () => {
    const rect = (top: number): DOMRect => ({top, left: 0, right: 100, bottom: top + 30, width: 100, height: 30, x: 0, y: top, toJSON: () => ({top})});
    const viewport = {scrollTop: 200, getBoundingClientRect: () => rect(50)};
    const anchor = {element: {isConnected: true, getBoundingClientRect: () => rect(140)}, offset: 10};
    restoreChatReadingAnchor(viewport, anchor);
    expect(viewport.scrollTop).toBe(280);
    restoreChatReadingAnchor(viewport, {...anchor, element: {...anchor.element, isConnected: false}});
    expect(viewport.scrollTop).toBe(280);
  });
  it("follows a real reducer SSE merge within 96px of the bottom", () => {
    const {viewport, scroll} = setup();
    viewport.scrollTop = 420;
    scroll.onScroll();
    const state = customerChatReducer(createInitialCustomerChatState([{id: "a", body: "Earlier", sender: "customer", position: 1}]), {type: "realtime_message_received", message: {id: "b", body: "Reply", sender: "support", position: 2}});
    viewport.scrollHeight = 1100;
    scroll.reconcile(state.messages.map(({id}) => id), true);
    expect(viewport.scrollTo).toHaveBeenLastCalledWith({top: 600, behavior: "smooth"});
  });
  it("preserves reading position and counts unique incoming messages across merges", () => {
    const {viewport, scroll, announce} = setup();
    viewport.scrollTop = 100;
    scroll.onScroll();
    scroll.reconcile(["a", "b"], true);
    scroll.reconcile(["a", "b", "c"], true);
    scroll.reconcile(["a", "b", "c"], true);
    scroll.onResize();
    expect(viewport.scrollTop).toBe(100);
    expect(viewport.scrollTo).not.toHaveBeenCalled();
    expect(announce.mock.calls).toEqual([[1], [2]]);
    scroll.latest();
    expect(viewport.scrollTo).toHaveBeenCalledWith({top: 500, behavior: "smooth"});
    expect(announce).toHaveBeenLastCalledWith(0);
  });
  it("clears the indicator when the reader reaches the bottom", () => {
    const {viewport, scroll, announce} = setup();
    viewport.scrollTop = 0;
    scroll.onScroll(); scroll.reconcile(["a", "b"], true);
    viewport.scrollTop = 500; scroll.onScroll();
    expect(announce).toHaveBeenLastCalledWith(0);
  });
  it("does not scroll partial history or animate initial history", () => {
    const viewport = {scrollTop: 0, scrollHeight: 1000, clientHeight: 500, scrollTo: vi.fn()};
    const scroll = new CustomerChatScroll(viewport, () => false, vi.fn());
    scroll.reconcile(["sse"], false);
    expect(viewport.scrollTo).not.toHaveBeenCalled();
    scroll.reconcile(["history", "sse"], true);
    expect(viewport.scrollTo.mock.calls).toEqual([[{top: 500, behavior: "auto"}]]);
  });
  it("does not count persisted acknowledgement or replay as another message", () => {
    const {scroll, viewport, announce} = setup();
    viewport.scrollTop = 0; scroll.onScroll();
    scroll.reconcile(["a", "acknowledged"], true);
    scroll.reconcile(["acknowledged", "a"], true);
    expect(announce.mock.calls).toEqual([[1]]);
  });
  it("respects reduced motion for arrivals and indicator clicks and follows resized content", () => {
    const {scroll, viewport} = setup(true);
    scroll.reconcile(["a", "b"], true); scroll.latest(); scroll.onResize();
    expect(viewport.scrollTo.mock.calls).toEqual(Array(3).fill([{top: 500, behavior: "auto"}]));
  });
  it("keeps following consecutive arrivals during a smooth scroll, until the reader intervenes", () => {
    const {scroll, viewport, announce} = setup();
    viewport.scrollHeight = 1400;
    scroll.reconcile(["a", "b"], true);
    viewport.scrollTop = 600; scroll.onScroll();
    scroll.reconcile(["a", "b", "c"], true);
    expect(viewport.scrollTo).toHaveBeenCalledTimes(2);
    scroll.onUserScroll(); viewport.scrollTop = 100; scroll.onScroll();
    scroll.reconcile(["a", "b", "c", "d"], true);
    expect(viewport.scrollTo).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(1);
  });
  it("does not pull a reader to the bottom when initial history completes after they scrolled", () => {
    const viewport = {scrollTop: 0, scrollHeight: 1000, clientHeight: 500, scrollTo: vi.fn()};
    const scroll = new CustomerChatScroll(viewport, () => false, vi.fn());
    scroll.onScroll(); scroll.reconcile(["history", "sse"], true);
    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });
});
