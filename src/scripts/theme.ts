import {
  themeStorageKey, customPaletteStorageKey, customSlotCount,
} from '../config/theme.config';
import { normalizeThemeColor, deriveThemeColors, applyThemeColors } from './theme-colors';
import { siteConfig } from '../config/site.config';
import { getUi } from '../i18n/ui';
const ui = getUi(siteConfig.lang);

const defaultColor = document.documentElement.dataset.aeroDefaultColor!;
let currentColor = normalizeThemeColor(document.documentElement.dataset.aeroColor) ?? defaultColor;
let customSlots: (string | null)[] = Array(customSlotCount).fill(null);
try {
  const stored = JSON.parse(localStorage.getItem(customPaletteStorageKey) ?? 'null');
  if (Array.isArray(stored)) customSlots = customSlots.map((_, index) => normalizeThemeColor(stored[index]));
} catch { /* Start with empty slots when storage is unavailable. */ }
let selectedSlot = Math.max(0, customSlots.indexOf(null));

function applyTheme(root: HTMLElement = document.documentElement) {
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--white-main');
  applyThemeColors(root, currentColor, deriveThemeColors(currentColor, surface));
}

function syncSwitcher() {
  applyTheme();
  const switcher = document.querySelector<HTMLElement>('[data-theme-switcher]');
  if (!switcher) return;
  const preview = switcher.querySelector<HTMLElement>('[data-color1-swatch]');
  if (preview) preview.style.backgroundColor = currentColor;
  const input = switcher.querySelector<HTMLInputElement>('[data-custom-color-input]');
  if (input) input.value = currentColor.toLowerCase();

  for (const cell of switcher.querySelectorAll<HTMLButtonElement>('[data-paint-color]')) {
    cell.setAttribute('aria-pressed', String(cell.dataset.paintColor === currentColor));
  }
  for (const cell of switcher.querySelectorAll<HTMLButtonElement>('[data-custom-slot]')) {
    const index = Number(cell.dataset.customSlot);
    const color = customSlots[index];
    cell.classList.toggle('is-empty', !color);
    cell.classList.toggle('is-editing', index === selectedSlot);
    cell.style.setProperty('--swatch-color', color ?? 'transparent');
    cell.setAttribute('aria-pressed', String(color === currentColor));
    const label = color ? ui.customSlotColor(index + 1, color) : ui.emptyCustomSlot(index + 1);
    cell.setAttribute('aria-label', index === selectedSlot ? `${label} · ${ui.editTarget}` : label);
    cell.title = label;
  }
  const clear = switcher.querySelector<HTMLButtonElement>('[data-clear-slot]');
  if (clear) clear.disabled = !customSlots[selectedSlot];
}

function saveSlots() {
  try {
    localStorage.setItem(customPaletteStorageKey, JSON.stringify(customSlots));
  } catch { /* The current page continues using the in-memory slots. */ }
}

function announce(switcher: HTMLElement, message: string) {
  const status = switcher.querySelector<HTMLElement>('[data-theme-status]');
  if (status) status.textContent = message;
}

function selectColor(color: string, switcher: HTMLElement) {
  currentColor = color;
  syncSwitcher();
  try {
    if (color === defaultColor) localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, color);
  } catch { /* Navigation continues using the in-memory color. */ }
  announce(switcher, color === defaultColor ? ui.themeRestored(color) : ui.themeChanged(color));
}

function setPaletteOpen(switcher: HTMLElement, open: boolean) {
  const toggle = switcher.querySelector<HTMLButtonElement>('[data-palette-toggle]')!;
  const accordion = switcher.querySelector<HTMLElement>('[data-palette-accordion]')!;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? ui.closePalette : ui.openPalette);
  toggle.title = open ? ui.closePalette : ui.openPalette;
  toggle.classList.toggle('active', open);
  accordion.hidden = !open;
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const switcher = event.target.closest<HTMLElement>('[data-theme-switcher]');
  const button = event.target.closest<HTMLButtonElement>('button');
  if (!switcher || !button) return;

  if (button.hasAttribute('data-palette-toggle')) {
    setPaletteOpen(switcher, button.getAttribute('aria-expanded') !== 'true');
  } else if (button.hasAttribute('data-palette-close')) {
    setPaletteOpen(switcher, false);
    switcher.querySelector<HTMLButtonElement>('[data-palette-toggle]')?.focus();
  } else if (button.hasAttribute('data-palette-reset')) {
    selectColor(defaultColor, switcher);
  } else if (button.hasAttribute('data-clear-slot')) {
    customSlots[selectedSlot] = null;
    saveSlots();
    syncSwitcher();
    switcher.querySelector<HTMLButtonElement>(`[data-custom-slot="${selectedSlot}"]`)?.focus();
    announce(switcher, ui.colorSlotCleared(selectedSlot + 1));
  } else if (button.hasAttribute('data-paint-color')) {
    const color = normalizeThemeColor(button.dataset.paintColor);
    if (color) selectColor(color, switcher);
  } else if (button.hasAttribute('data-custom-slot')) {
    selectedSlot = Number(button.dataset.customSlot);
    const color = customSlots[selectedSlot];
    if (color) selectColor(color, switcher);
    else {
      syncSwitcher();
      switcher.querySelector<HTMLInputElement>('[data-custom-color-input]')?.click();
    }
  }
});

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches('[data-custom-color-input]')) return;
  const switcher = input.closest<HTMLElement>('[data-theme-switcher]');
  const color = normalizeThemeColor(input.value);
  if (!switcher || !color) return;
  customSlots[selectedSlot] = color;
  saveSlots();
  selectColor(color, switcher);
});

document.addEventListener('astro:before-swap', (event) => {
  applyTheme(event.newDocument.documentElement);
});
document.addEventListener('astro:page-load', syncSwitcher);
syncSwitcher();
