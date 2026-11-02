/** Keep the floating playlist inside the viewport and any clipping sidebar. */
export function createPlaylistPositioner(player: HTMLElement, panel: HTMLElement, items: HTMLElement) {
  const document = player.ownerDocument;
  const window = document.defaultView!;
  const content = player.querySelector<HTMLElement>('.player-content')!;
  const controls = player.querySelector<HTMLElement>('.music-controls')!;
  const heading = panel.querySelector<HTMLElement>('.playlist-heading')!;
  const feedback = panel.querySelector<HTMLElement>('.playlist-feedback')!;
  const gap = 8;
  const margin = 12;
  let frame = 0;
  let events: AbortController | undefined;
  let resize: ResizeObserver | undefined;
  let mutation: MutationObserver | undefined;

  const position = () => {
    if (panel.hidden || !player.isConnected) return;
    const viewport = window.visualViewport;
    let top = (viewport?.offsetTop ?? 0) + margin;
    let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? document.documentElement.clientHeight) - margin;
    for (let ancestor = player.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      if (!/^(auto|scroll|hidden|clip)$/.test(window.getComputedStyle(ancestor).overflowY)) continue;
      const rect = ancestor.getBoundingClientRect();
      top = Math.max(top, rect.top + ancestor.clientTop + margin);
      bottom = Math.min(bottom, rect.top + ancestor.clientTop + ancestor.clientHeight - margin);
    }
    if (bottom <= top) return;

    // Measure the natural panel, including wrapped actions and loading/error feedback.
    panel.style.removeProperty('--playlist-max-height');
    const preferredHeight = panel.getBoundingClientRect().height;
    const chromeHeight = preferredHeight - items.getBoundingClientRect().height;
    const playerRect = player.getBoundingClientRect();
    const anchorBottom = Math.max(playerRect.bottom, controls.getBoundingClientRect().bottom);
    const height = bottom - top;
    const above = Math.max(0, Math.min(height, playerRect.top - gap - top));
    const below = Math.max(0, Math.min(height, bottom - anchorBottom - gap));
    const openAbove = preferredHeight > below && above > below;
    let available = openAbove ? above : below;
    // In an exceptionally tight space, keep the actions accessible within the visible area.
    if (available < chromeHeight) available = height;
    const panelHeight = Math.min(preferredHeight, available);
    const preferredTop = openAbove ? playerRect.top - gap - panelHeight : anchorBottom + gap;
    const panelTop = Math.max(top, Math.min(preferredTop, bottom - panelHeight));
    panel.style.top = `${panelTop - content.getBoundingClientRect().top}px`;
    panel.style.setProperty('--playlist-max-height', `${available}px`);
    panel.dataset.placement = openAbove ? 'above' : 'below';
  };
  const schedule = () => {
    if (frame || panel.hidden) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      position();
    });
  };
  const stop = () => {
    events?.abort();
    resize?.disconnect();
    mutation?.disconnect();
    window.cancelAnimationFrame(frame);
    frame = 0;
  };
  const setOpen = (open: boolean) => {
    stop();
    if (!open) return;
    events = new window.AbortController();
    const { signal } = events;
    window.addEventListener('resize', schedule, { signal });
    window.visualViewport?.addEventListener('resize', schedule, { signal });
    window.visualViewport?.addEventListener('scroll', schedule, { signal });
    document.addEventListener('scroll', (event) => {
      if (!(event.target instanceof window.Node) || !panel.contains(event.target)) schedule();
    }, { capture: true, passive: true, signal });
    document.addEventListener('transitionend', schedule, { capture: true, signal });
    resize = new window.ResizeObserver(schedule);
    for (const target of [content, heading, feedback]) resize.observe(target);
    for (let ancestor = player.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      resize.observe(ancestor);
    }
    mutation = new window.MutationObserver(schedule);
    mutation.observe(items, { childList: true, subtree: true, characterData: true });
    position();
  };

  return setOpen;
}
