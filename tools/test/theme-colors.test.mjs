import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveThemeColors } from '../../src/scripts/theme-colors.ts';

const white = [255, 255, 255];
const black = [0, 0, 0];

function channels(value) {
  const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(value);
  assert.ok(match, `expected a legacy-compatible RGB color, received ${value}`);
  return match.slice(1).map(Number);
}

// Independently evaluate the HSL tokens at full precision, as CSS does before mixing.
function hslChannels(value) {
  const match = /^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(value);
  assert.ok(match, `expected an HSL color, received ${value}`);
  const [, hue, saturation, lightness] = match.map(Number);
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((offset) => {
    const k = (offset + hue / 30) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  });
}

function assertMix(actual, first, second, weight, name) {
  const mixed = channels(actual);
  for (let index = 0; index < 3; index++) {
    const expected = first[index] * (1 - weight) + second[index] * weight;
    assert.ok(Math.abs(mixed[index] - expected) <= 1,
      `${name} channel ${index} differs from the CSS sRGB mix (${mixed[index]} vs ${expected})`);
  }
}

test('all ten legacy RGB mixes match CSS sRGB interpolation for representative colors', () => {
  for (const [color, surface] of [
    ['#3C7FB1', '#F2F6F8'],
    ['#B25A30', '#DBE4F0'],
    ['#808080', '#F2F6F8'],
    ['#010102', '#F2F6F8'],
    ['#FEFEFD', '#F2F6F8'],
  ]) {
    const tokens = deriveThemeColors(color, surface);
    const primary = channels(tokens['--primary-color']);
    const highlight = hslChannels(tokens['--highlight-color']);
    const secondary = hslChannels(tokens['--secondary-color']);

    assert.equal(tokens['--palette-preview-color'], color);
    assert.equal(tokens['--primary-rgb'], primary.join(', '));
    assert.equal(tokens['--surface-rgb'], [1, 3, 5]
      .map((offset) => parseInt(surface.slice(offset, offset + 2), 16)).join(', '));
    assert.match(tokens['--link-color'], /^rgb\(/);
    assert.match(tokens['--code-color'], /^rgb\(/);
    assert.match(tokens['--player-accent'], /^rgb\(/);

    for (const [name, first, second, weight] of [
      ['--aero-grad-light', secondary, white, 0.6],
      ['--aero-grad-dark', secondary, black, 0.1],
      ['--highlight-hover-dark', highlight, black, 0.1],
      ['--music-glow-color', primary, white, 0.5],
      ['--playlist-selected-border', primary, [125, 162, 206], 0.45],
      ['--playlist-selected-start', highlight, white, 0.7],
      ['--playlist-selected-end', primary, white, 0.75],
      ['--playlist-hover-border', primary, white, 0.3],
      ['--playlist-hover-start', highlight, white, 0.82],
      ['--playlist-hover-end', primary, white, 0.84],
    ]) {
      assertMix(tokens[name], first, second, weight, `${color} ${name}`);
    }
  }
});

test('inline first-paint function produces the same tokens without module dependencies', () => {
  const inlineDerive = Function(`return (${deriveThemeColors.toString()})`)();
  for (const color of ['#3C7FB1', '#B25A30', '#808080']) {
    assert.deepEqual(inlineDerive(color, '#F2F6F8'), deriveThemeColors(color, '#F2F6F8'));
  }
  assert.equal(deriveThemeColors('#3C7FB1', 'invalid')['--surface-rgb'], '242, 246, 248');
});
