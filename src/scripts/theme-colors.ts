export function normalizeThemeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null;
}

// Keep these functions self-contained so BaseLayout can inline their compiled
// JavaScript before the first paint, using the same implementation as navigation.
export function deriveThemeColors(hex: string, surface = '#F2F6F8'): Record<string, string> {
  function rgbFromHex(value: string): number[] {
    return [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  }

  function rgbFromHsl(hue: number, saturation: number, lightness: number): number[] {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const offset = lightness - chroma / 2;
    const sectors = [
      [chroma, second, 0], [second, chroma, 0], [0, chroma, second],
      [0, second, chroma], [second, 0, chroma], [chroma, 0, second],
    ];
    return sectors[Math.floor(hue / 60) % 6].map((channel) => Math.round((channel + offset) * 255));
  }

  function mix(first: number[], second: number[], weight: number): number[] {
    return first.map((channel, index) =>
      Math.round(channel * (1 - weight) + second[index] * weight)
    );
  }

  function cssRgb(channels: number[]): string {
    return `rgb(${channels.join(' ')})`;
  }

  function luminance(rgb: number[]): number {
    const [red, green, blue] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  function contrast(foreground: number[], background: number[]): number {
    const first = luminance(foreground) + 0.05;
    const second = luminance(background) + 0.05;
    return Math.max(first, second) / Math.min(first, second);
  }

  function readableColor(color: number[], background: number[]): string {
    const black = [0, 0, 0];
    const white = [255, 255, 255];
    const endpoint = contrast(black, background) >= contrast(white, background) ? black : white;
    let result = color;
    for (let step = 1; contrast(result, background) < 4.5 && step <= 50; step++) {
      result = color.map((channel, index) => Math.round(channel + (endpoint[index] - channel) * step / 50));
    }
    return `rgb(${result.join(' ')})`;
  }

  const [red, green, blue] = rgbFromHex(hex).map((channel) => channel / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;
  if (difference > 0) {
    saturation = difference / (1 - Math.abs(2 * lightness - 1));
    switch (maximum) {
      case red: hue = (green - blue) / difference + (green < blue ? 6 : 0); break;
      case green: hue = (blue - red) / difference + 2; break;
      case blue: hue = (red - green) / difference + 4; break;
    }
    hue *= 60;
  }

  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  const sat = saturation * 100;
  const lum = lightness * 100;
  const primarySaturation = saturation < 0.08 ? sat : clamp(sat, 28, 72);
  const primaryLightness = clamp(lum, 30, 52);
  const primary = rgbFromHsl(hue, primarySaturation / 100, primaryLightness / 100);
  const highlightSaturation = saturation < 0.08 ? sat : clamp(sat + 15, 45, 90);
  const secondarySaturation = saturation < 0.08 ? sat : clamp(sat * 0.35, 14, 34);
  const highlight = rgbFromHsl(hue, highlightSaturation / 100, clamp(lum + 32, 74, 88) / 100);
  const secondary = rgbFromHsl(hue, secondarySaturation / 100, clamp(lum + 38, 84, 91) / 100);
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  const background = rgbFromHex(/^#[0-9a-f]{6}$/i.test(surface.trim()) ? surface.trim() : '#F2F6F8');
  // Inline code adds a 5% #1b1f23 overlay to the reading surface.
  const codeBackground = background.map((channel, index) => Math.round(channel * 0.95 + [27, 31, 35][index] * 0.05));

  return {
    '--palette-preview-color': hex,
    '--primary-color': cssRgb(primary),
    '--primary-rgb': primary.join(', '),
    '--surface-rgb': background.join(', '),
    '--highlight-color': `hsl(${hue} ${highlightSaturation}% ${clamp(lum + 32, 74, 88)}%)`,
    '--secondary-color': `hsl(${hue} ${secondarySaturation}% ${clamp(lum + 38, 84, 91)}%)`,
    '--aero-grad-light': cssRgb(mix(secondary, white, 0.6)),
    '--aero-grad-dark': cssRgb(mix(secondary, black, 0.1)),
    '--highlight-hover-dark': cssRgb(mix(highlight, black, 0.1)),
    '--music-glow-color': cssRgb(mix(primary, white, 0.5)),
    '--playlist-selected-border': cssRgb(mix(primary, [125, 162, 206], 0.45)),
    '--playlist-selected-start': cssRgb(mix(highlight, white, 0.7)),
    '--playlist-selected-end': cssRgb(mix(primary, white, 0.75)),
    '--playlist-hover-border': cssRgb(mix(primary, white, 0.3)),
    '--playlist-hover-start': cssRgb(mix(highlight, white, 0.82)),
    '--playlist-hover-end': cssRgb(mix(primary, white, 0.84)),
    '--link-color': readableColor(primary, background),
    '--code-color': readableColor(primary, codeBackground),
    '--player-accent': readableColor(rgbFromHsl(hue, saturation, primaryLightness / 100), background),
  };
}

export function applyThemeColors(root: HTMLElement, color: string, tokens: Record<string, string>): void {
  root.dataset.aeroColor = color;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
}
