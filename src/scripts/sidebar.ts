import { siteConfig } from '../config/site.config';
import { getUi } from '../i18n/ui';
const ui = getUi(siteConfig.lang);
let dispose = () => {};

function initializeSidebar() {
  dispose();
  const controller = new AbortController();
  const { signal } = controller;
  dispose = () => controller.abort();

  const button = document.querySelector<HTMLButtonElement>('#mobile-menu-btn');
  const sidebar = document.querySelector<HTMLElement>('#sidebar');
  const mask = document.querySelector<HTMLElement>('#sidebar-mask');
  const main = document.querySelector<HTMLElement>('#main-content');
  const mobile = window.matchMedia('(max-width: 768px)');

  if (button && sidebar && mask && main) {
    const targets = () => Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled)'))
      .filter((element) => !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
    const setOpen = (open: boolean, restoreFocus = false, keyboard = false) => {
      sidebar.classList.toggle('open', open);
      mask.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? ui.closeSidebar : ui.openSidebar);
      document.body.classList.toggle('sidebar-open', open);
      sidebar.inert = mobile.matches && !open;
      main.inert = open;
      if (open) (keyboard ? targets()[0] ?? sidebar : sidebar).focus({ preventScroll: true });
      if (!open && restoreFocus) button.focus({ preventScroll: true });
    };

    let pointerActivation = false;
    button.addEventListener('pointerdown', () => { pointerActivation = true; }, { signal });
    button.addEventListener('pointercancel', () => { pointerActivation = false; }, { signal });
    button.addEventListener('keydown', () => { pointerActivation = false; }, { signal });
    button.addEventListener('click', (event) => {
      setOpen(!sidebar.classList.contains('open'), false, !pointerActivation && event.detail === 0);
      pointerActivation = false;
    }, { signal });
    mask.addEventListener('click', () => setOpen(false, true), { signal });
    document.addEventListener('keydown', (event) => {
      if (!sidebar.classList.contains('open')) return;
      if (event.key === 'Escape') setOpen(false, true);
      if (event.key === 'Tab') {
        const controls = targets();
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); sidebar.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === sidebar)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sidebar)) { event.preventDefault(); first.focus(); }
      }
    }, { signal });
    mobile.addEventListener('change', () => setOpen(false), { signal });
    setOpen(false);
  }
}

initializeSidebar();
document.addEventListener('astro:before-swap', () => dispose());
document.addEventListener('astro:page-load', initializeSidebar);
