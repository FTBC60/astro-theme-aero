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
  const items = panel.querySelector<HTMLOListElement>('.playlist-items')!;
  const events = new window.AbortController();
  const { signal } = events;
  const position = createPlaylistPositioner(player, panel, items);
  const touch = createPlaylistTouchGuard(panel, items);
  let suspended = false;
  let disposed = false;

  const observe = (open: boolean) => {
    position(open);
    touch.setOpen(open);
  };
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    player.classList.toggle('playlist-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? closeLabel : openLabel);
    observe(open && !suspended);
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden), { signal });
  items.addEventListener('click', (event) => {
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
    if (!panel.hidden && event.target instanceof window.Node && !player.contains(event.target)) setOpen(false);
  }, { signal });
  player.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    setOpen(false);
    // Keep bubbling: the mobile sidebar also closes and restores its menu button.
    toggle.focus();
  }, { signal });
  document.addEventListener('astro:before-swap', () => {
    suspended = true;
    observe(false);
  }, { signal });
  document.addEventListener('astro:page-load', () => {
    suspended = false;
    if (player.isConnected) observe(!panel.hidden);
  }, { signal });
  setOpen(!panel.hidden);
  return () => {
    if (disposed) return;
    disposed = true;
    setOpen(false);
    events.abort();
  };
}
