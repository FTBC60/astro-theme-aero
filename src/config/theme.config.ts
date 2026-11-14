export const themeConfig: {
  defaultColor: string;
  wallpaper: string;
  wallpaperPosition: string;
} = {
  // Six-digit HEX. Recommended colors: #3C7FB1, #437F68, #73619B.
  defaultColor: '#3C7FB1',
  // Use a public/ path or a full HTTPS URL. Keep the image independent of the avatar and music covers.
  wallpaper: '/image/wallpaper.jpg',
  // CSS background-position; for example, 'center center' or '70% center'.
  wallpaperPosition: 'center center',
};

// Windows 7 Paint's two rows of standard colors, followed in the UI by custom slots.
export const win7PaintColors = [
  '#000000', '#7F7F7F', '#880015', '#ED1C24', '#FF7F27',
  '#FFF200', '#22B14C', '#00A2E8', '#3F48CC', '#A349A4',
  '#FFFFFF', '#C3C3C3', '#B97A57', '#FFAEC9', '#FFC90E',
  '#EFE4B0', '#B5E61D', '#99D9EA', '#7092BE', '#C8BFE7',
] as const;

export const customSlotCount = 10;
export const themeStorageKey = 'aero-theme';
export const customPaletteStorageKey = 'aero-custom-palette';
