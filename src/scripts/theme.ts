import { themeConfig, themePresets, themeStorageKey, type ThemeId } from '../config/theme.config';
import { siteConfig } from '../config/site.config';
import { getUi } from '../i18n/ui';
const ui = getUi(siteConfig.lang);

const presetIds = new Set<string>(themePresets.map((preset) => preset.id));

function savedTheme(): ThemeId | null {
  try {
    const value = localStorage.getItem(themeStorageKey);
    return value && presetIds.has(value) ? value as ThemeId : null;
  } catch {
    return null;
  }
}

function applyTheme(root: HTMLElement = document.documentElement) {
  const choice = savedTheme();
  root.dataset.aeroTheme = choice ?? themeConfig.defaultTheme;
  return choice;
}

function syncSwitcher() {
  const switcher = document.querySelector<HTMLElement>('[data-theme-switcher]');
  if (!switcher) return;
  const choice = applyTheme();
  const active = choice ?? themeConfig.defaultTheme;
  for (const input of switcher.querySelectorAll<HTMLInputElement>('input[name="aero-theme"]')) {
    input.checked = input.value === active;
  }
}

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.name !== 'aero-theme' || !input.closest('[data-theme-switcher]')) return;
  if (!presetIds.has(input.value)) return;
  try {
    if (input.value === themeConfig.defaultTheme) localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, input.value);
  } catch { /* Keep the choice for this page. */ }
  document.documentElement.dataset.aeroTheme = input.value;
  const label = ui.themeLabels[input.value as ThemeId];
  const status = input.closest('[data-theme-switcher]')?.querySelector<HTMLElement>('[data-theme-status]');
  if (status) status.textContent = input.value === themeConfig.defaultTheme
    ? ui.themeRestored(label)
    : ui.themeChanged(label);
});

document.addEventListener('astro:before-swap', (event) => {
  applyTheme(event.newDocument.documentElement);
});
document.addEventListener('astro:page-load', syncSwitcher);
syncSwitcher();
