/** Keep the floating playlist anchored below the player and sized to the available downward space. */
export function createPlaylistPositioner(player: HTMLElement, panel: HTMLElement) {
  const document = player.ownerDocument;
  const window = document.defaultView!;
  const content = player.querySelector<HTMLElement>('.player-content')!;
  const controls = player.querySelector<HTMLElement>('.music-controls')!;
  const heading = panel.querySelector<HTMLElement>('.playlist-heading')!;
  const inner = panel.querySelector<HTMLElement>('.playlist-accordion-inner')!;
  const feedback = panel.querySelector<HTMLElement>('.playlist-feedback')!;
  const gap = 8;
  const margin = 12;
  let frame = 0;
  let events: AbortController | undefined;
  let resize: ResizeObserver | undefined;

  const position = () => {
    if (panel.hidden || !player.isConnected) return;
    const viewport = window.visualViewport;
    let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? document.documentElement.clientHeight) - margin;
    for (let ancestor = player.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      if (!/^(auto|scroll|hidden|clip)$/.test(window.getComputedStyle(ancestor).overflowY)) continue;
      const rect = ancestor.getBoundingClientRect();
      bottom = Math.min(bottom, rect.top + ancestor.clientTop + ancestor.clientHeight - margin);
    }

    const playerRect = player.getBoundingClientRect();
    const anchorBottom = Math.max(playerRect.bottom, controls.getBoundingClientRect().bottom);
    const panelTop = anchorBottom + gap;
    const available = Math.max(0, bottom - panelTop);
    // The inset is outside the window's border-box and must fit within the viewport.
    const innerStyle = window.getComputedStyle(inner);
    const outerPadding = parseFloat(innerStyle.paddingTop) + parseFloat(innerStyle.paddingBottom);

    panel.style.top = `${panelTop - content.getBoundingClientRect().top}px`;
    panel.style.setProperty('--playlist-outer-max-height', `${available}px`);
    panel.style.setProperty('--playlist-max-height', `${Math.max(0, available - outerPadding)}px`);
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
    resize = new window.ResizeObserver(schedule);
    for (const target of [content, heading, feedback]) resize.observe(target);
    for (let ancestor = player.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      resize.observe(ancestor);
    }

    position();
  };

  return setOpen;
}
