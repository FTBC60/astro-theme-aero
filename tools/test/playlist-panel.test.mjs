import assert from 'node:assert/strict';
import test from 'node:test';
import { playlistHarness } from './fixtures/playlist-dom.mjs';

function assertOpen(h, open) {
  assert.equal(h.panel.hidden, !open);
  assert.equal(h.player.classList.contains('playlist-open'), open);
  assert.equal(h.toggle.getAttribute('aria-expanded'), String(open));
  assert.equal(h.toggle.getAttribute('aria-label'), open ? 'Close playlist' : 'Open playlist');
}

test('the toggle keeps visibility, player class and accessible labels synchronized', (t) => {
  const h = playlistHarness(t);
  assertOpen(h, false);
  h.open();
  assertOpen(h, true);
  assert(h.panel.style.top);
  assert(h.panel.style.getPropertyValue('--playlist-max-height'));
  assert(h.observers.some((observer) => observer.targets.has(h.sidebar)));
  h.dispatch(h.window, 'resize');
  assert.equal(h.frames.size, 1);
  h.close();
  assertOpen(h, false);
  assert.equal(h.frames.size, 0);
  assert(h.observers.every((observer) => observer.targets.size === 0));
});

test('inside clicks keep the panel open; outside clicks close without stealing focus', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.dispatch(h.panel, 'click');
  assertOpen(h, true);
  h.outside.focus();
  h.dispatch(h.outside, 'click');
  assertOpen(h, false);
  assert.equal(h.document.activeElement, h.outside);
  assert.deepEqual(h.selected, []);
});

test('delegated mouse selection reports one index, closes and returns focus to the toggle', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.track.dataset.trackIndex = '12';
  h.click({ pointerType: 'mouse' });
  assert.deepEqual(h.selected, [12]);
  assertOpen(h, false);
  assert.equal(h.document.activeElement, h.toggle);
  h.click({ pointerType: 'mouse' });
  assert.deepEqual(h.selected, [12]);
});

test('Escape closes and restores focus while unrelated keys leave the panel open', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.dispatch(h.track, 'keydown', { key: 'Enter' });
  assertOpen(h, true);
  const escape = h.dispatch(h.track, 'keydown', { key: 'Escape' });
  assertOpen(h, false);
  assert.equal(h.document.activeElement, h.toggle);
  assert.equal(escape.defaultPrevented, false);
});

test('Escape keeps bubbling so the mobile sidebar can close and restore its menu focus', (t) => {
  const h = playlistHarness(t);
  const menu = h.document.createElement();
  h.document.body.append(menu);
  let sidebarOpen = true;
  h.document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebarOpen) { sidebarOpen = false; menu.focus(); }
  });
  h.open();
  h.dispatch(h.track, 'keydown', { key: 'Escape' });
  assertOpen(h, false);
  assert.equal(sidebarOpen, false);
  assert.equal(h.document.activeElement, menu);
});

test('navigation suspends observers and frames, then observes the new sidebar without selecting', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.dispatch(h.window, 'resize');
  assert.equal(h.frames.size, 1);
  h.pointer('pointerdown');
  h.scroll();
  h.dispatch(h.document, 'astro:before-swap');
  assertOpen(h, true);
  assert.equal(h.frames.size, 0);
  assert(h.observers.every((observer) => observer.targets.size === 0));
  const sidebar = h.newSidebar();
  sidebar.append(h.player);
  h.dispatch(h.document, 'astro:page-load');
  assertOpen(h, true);
  assert(h.observers.some((observer) => observer.targets.has(sidebar)));
  assert(!h.observers.some((observer) => observer.targets.has(h.sidebar)));
  assert.deepEqual(h.selected, []);
  h.scroll(h.sidebar);
  h.tap();
  assert.deepEqual(h.selected, [0]);
});

test('the new sidebar scroll participates in touch filtering after navigation', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.dispatch(h.document, 'astro:before-swap');
  const sidebar = h.newSidebar();
  sidebar.append(h.player);
  h.dispatch(h.document, 'astro:page-load');
  h.scroll(sidebar);
  h.tap();
  assert.deepEqual(h.selected, []);
  assertOpen(h, true);
});

test('a closed panel stays inactive after repeated navigation events', (t) => {
  const h = playlistHarness(t);
  for (let index = 0; index < 3; index++) {
    h.dispatch(h.document, 'astro:before-swap');
    h.dispatch(h.document, 'astro:page-load');
  }
  assertOpen(h, false);
  assert.equal(h.observers.length, 0);
  h.open();
  h.click({ pointerType: 'mouse' });
  assert.deepEqual(h.selected, [0]);
});

test('repeated navigation while open does not duplicate selection listeners', (t) => {
  const h = playlistHarness(t);
  h.open();
  for (let index = 0; index < 3; index++) {
    h.dispatch(h.document, 'astro:before-swap');
    h.dispatch(h.document, 'astro:page-load');
  }
  h.tap();
  assert.deepEqual(h.selected, [0]);
});

test('an unconnected player does not restart layout observations on page load', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.dispatch(h.document, 'astro:before-swap');
  h.player.remove();
  h.dispatch(h.document, 'astro:page-load');
  assert(h.observers.every((observer) => observer.targets.size === 0));
});

test('dispose closes without focus changes and removes clicks, keys, navigation and observers', (t) => {
  const h = playlistHarness(t);
  h.open();
  h.pointer('pointerdown');
  h.scroll();
  h.dispatch(h.window, 'resize');
  h.outside.focus();
  h.dispose();
  h.dispose();
  assertOpen(h, false);
  assert.equal(h.document.activeElement, h.outside);
  assert.equal(h.frames.size, 0);
  assert(h.observers.every((observer) => observer.targets.size === 0));
  h.dispatch(h.toggle, 'click');
  h.click({ pointerType: 'mouse' });
  h.dispatch(h.document, 'astro:page-load');
  h.dispatch(h.window, 'resize');
  h.observers.forEach((observer) => observer.trigger());
  t.mock.timers.tick(1000);
  h.flushFrames();
  assertOpen(h, false);
  assert.deepEqual(h.selected, []);
  assert.equal(h.frames.size, 0);
});
