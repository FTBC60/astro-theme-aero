const MOVE_THRESHOLD = 10;
const SCROLL_IDLE_MS = 150;
type ScrollPosition = { element: HTMLElement; top: number; left: number };

/** Filter touch-generated clicks without taking over native scrolling or zooming. */
export function createPlaylistTouchGuard(panel: HTMLElement, items: HTMLElement) {
  const document = items.ownerDocument;
  let events: AbortController | undefined;
  let gesture: {
    id: number; x: number; y: number; blocked: boolean; ended: boolean;
    scrollPositions: ScrollPosition[];
  } | undefined;
  const scrolling = new Map<EventTarget, ReturnType<typeof setTimeout>>();

  const endScroll = (target: EventTarget) => {
    clearTimeout(scrolling.get(target));
    scrolling.delete(target);
  };
  const affectsPlaylist = (target: EventTarget | null) => {
    // Walk the current ancestors: the persistent player moves into a new sidebar on navigation.
    for (let node: Node | null = items; node; node = node.parentNode) {
      if (node === target) return true;
    }
    return false;
  };
  const moved = (event: PointerEvent) => {
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= MOVE_THRESHOLD) {
      gesture.blocked = true;
    }
    if (gesture?.scrollPositions.some(({ element, top, left }) => element.scrollTop !== top || element.scrollLeft !== left)) {
      gesture.blocked = true;
    }
  };
  const stop = () => {
    events?.abort();
    gesture = undefined;
    for (const timer of scrolling.values()) clearTimeout(timer);
    scrolling.clear();
  };
  const setOpen = (open: boolean) => {
    stop();
    if (!open) return;
    events = new AbortController();
    const options = { capture: true, passive: true, signal: events.signal };
    items.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') { gesture = undefined; return; }
      if (!event.isPrimary) {
        if (gesture) gesture.blocked = true;
        return;
      }
      const scrollPositions: ScrollPosition[] = [];
      for (let node: Node | null = items; node; node = node.parentNode) {
        const element = node as HTMLElement;
        if (typeof element.scrollTop === 'number') {
          scrollPositions.push({ element, top: element.scrollTop, left: element.scrollLeft });
        }
      }
      gesture = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        blocked: scrolling.size > 0, ended: false, scrollPositions,
      };
    }, options);
    document.addEventListener('pointerdown', (event) => {
      if (gesture && !gesture.ended && event.pointerType !== 'mouse' && event.pointerId !== gesture.id) {
        gesture.blocked = true;
      }
    }, options);
    document.addEventListener('pointermove', (event) => {
      if (gesture?.id === event.pointerId && !gesture.ended) moved(event);
    }, options);
    document.addEventListener('pointerup', (event) => {
      if (gesture?.id !== event.pointerId) return;
      moved(event);
      gesture.ended = true;
    }, options);
    document.addEventListener('pointercancel', (event) => {
      if (gesture?.id !== event.pointerId) return;
      gesture.blocked = true;
      gesture.ended = true;
    }, options);
    document.addEventListener('scroll', (event) => {
      if (!event.target || !affectsPlaylist(event.target)) return;
      if (gesture) gesture.blocked = true;
      endScroll(event.target);
      // Fallback for browsers that do not emit scrollend on a nested scroller.
      const target = event.target;
      scrolling.set(target, setTimeout(() => endScroll(target), SCROLL_IDLE_MS));
    }, options);
    document.addEventListener('scrollend', (event) => {
      if (event.target) endScroll(event.target);
    }, options);
  };
  const canActivate = (event: MouseEvent) => {
    if (panel.hidden || panel.inert) return false;
    const pointer = event as PointerEvent;
    if (pointer.pointerType === 'mouse' || (!pointer.pointerType && event.detail === 0)) {
      gesture = undefined;
      return true;
    }
    if (!gesture) return !pointer.pointerType;
    if (pointer.pointerType && pointer.pointerId !== gesture.id) return false;
    // Scroll positions may update before the browser dispatches the scroll event.
    if (gesture.scrollPositions.some(({ element, top, left }) => element.scrollTop !== top || element.scrollLeft !== left)) {
      gesture.blocked = true;
    }
    const allowed = gesture.ended && !gesture.blocked;
    gesture = undefined;
    return allowed;
  };

  return { setOpen, canActivate };
}
