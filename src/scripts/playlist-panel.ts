import { createPlaylistPositioner } from './playlist-position.ts';
import { createPlaylistTouchGuard } from './playlist-touch.ts';

interface PlaylistPanelOptions {
  openLabel: string;
  closeLabel: string;
  onSelect: (index: number) => void;
}

/** Own the floating playlist's interaction and navigation lifecycle for one player. */
export function createPlaylistPanel(player: HTMLElement, { openLabel, closeLabel, onSelect }: PlaylistPanelOptions) {
  const document = player.ownerDocument;
  const window = document.defaultView!;
  const toggle = player.querySelector<HTMLButtonElement>('[data-playlist-toggle]')!;
  const panel = player.querySelector<HTMLElement>('[data-playlist-panel]')!;
  const close = panel.querySelector<HTMLButtonElement>('[data-playlist-close]');
  const items = panel.querySelector<HTMLOListElement>('.playlist-items')!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const events = new window.AbortController();
  const { signal } = events;
  const position = createPlaylistPositioner(player, panel);
  const touch = createPlaylistTouchGuard(items);
  let isOpen = !panel.hidden && player.classList.contains('playlist-open');
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let suspended = false;
  let disposed = false;
  const layerClass = 'playlist-layer-visible';
  let previousStickyParent: HTMLElement | null = null;

  const syncLayer = () => {
    const visible = !panel.hidden;
    const currentParent = visible
      ? player.closest<HTMLElement>('.sidebar-sticky-group')
      : null;

    if (previousStickyParent !== currentParent) {
      previousStickyParent?.classList.remove(layerClass);
    }

    player.classList.toggle(layerClass, visible);
    currentParent?.classList.add(layerClass);
    previousStickyParent = currentParent;
  };

  const hidePanel = () => {
    panel.hidden = true;
    syncLayer();
  };

  const clearHideTimer = () => {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };

  const observe = (open: boolean) => {
    position(open);
    touch.setOpen(open);
  };

  const setOpen = (open: boolean, immediate = false) => {
    isOpen = open;
    clearHideTimer();
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? closeLabel : openLabel);
    toggle.title = open ? closeLabel : openLabel;
    toggle.classList.toggle('active', open);
    panel.inert = !open;

    if (open) {
      const wasHidden = panel.hidden;
      panel.hidden = false;
      syncLayer();
      observe(!suspended);
      if (wasHidden && !immediate && !reducedMotion.matches) {
        void panel.offsetHeight;
      }
      player.classList.add('playlist-open');
    } else {
      player.classList.remove('playlist-open');
      observe(false);
      if (immediate || reducedMotion.matches || !player.isConnected) {
        hidePanel();
      } else {
        hideTimer = setTimeout(() => {
          hideTimer = undefined;
          if (!isOpen) hidePanel();
        }, 240);
      }
    }
  };

  panel.addEventListener('transitionend', (event) => {
    if (event.target === panel && event.propertyName === 'grid-template-rows' && !isOpen) {
      clearHideTimer();
      hidePanel();
    }
  }, { signal });

  toggle.addEventListener('click', () => setOpen(!isOpen), { signal });
  close?.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  }, { signal });
  items.addEventListener('click', (event) => {
    if (!isOpen) return;
    const button = event.target instanceof window.Element ? event.target.closest<HTMLElement>('[data-track-index]') : null;
    if (!button || !items.contains(button) || !touch.canActivate(event)) return;
    const index = Number(button.dataset.trackIndex);
    if (!Number.isInteger(index) || index < 0) return;
    onSelect(index);
    if (disposed) return;
    setOpen(false);
    toggle.focus();
  }, { signal });
  document.addEventListener('click', (event) => {
    if (isOpen && event.target instanceof window.Node && !player.contains(event.target)) setOpen(false);
  }, { signal });
  player.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen) return;
    setOpen(false);
    // Keep bubbling: the mobile sidebar also closes and restores its menu button.
    toggle.focus();
  }, { signal });
  document.addEventListener('astro:before-swap', () => {
    suspended = true;
    if (!isOpen) {
      clearHideTimer();
      hidePanel();
    }
    observe(false);
  }, { signal });
  document.addEventListener('astro:page-load', () => {
    suspended = false;
    syncLayer();
    if (player.isConnected) observe(isOpen);
  }, { signal });
  setOpen(isOpen, true);
  return () => {
    if (disposed) return;
    disposed = true;
    setOpen(false, true);
    events.abort();
  };
}
