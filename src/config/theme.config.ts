export const themePresets = [
  { id: 'classic-blue' },
  { id: 'emerald-green' },
  { id: 'violet' },
] as const;

export type ThemeId = (typeof themePresets)[number]['id'];

export const themeConfig: { defaultTheme: ThemeId; wallpaper: string; wallpaperPosition: string } = {
  // Choose the color shown to visitors who have not made their own selection.
  defaultTheme: 'classic-blue',
  // Use a public/ path or a full HTTPS URL. Keep the image independent of the avatar and music covers.
  wallpaper: '/image/wallpaper.jpg',
  // CSS background-position; for example, 'center center' or '70% center'.
  wallpaperPosition: 'center center',
};

export const themeStorageKey = 'aero-theme';
