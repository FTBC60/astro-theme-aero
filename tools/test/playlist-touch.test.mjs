import assert from 'node:assert/strict';
import test from 'node:test';
import { playlistHarness } from './fixtures/playlist-dom.mjs';

function harness(t) {
  const h = playlistHarness(t);
  h.open();
  return h;
}

test('a stationary tap plays once and closes the playlist', (t) => {
  const h = harness(t);
  h.tap();
  assert.equal(h.state.plays, 1);
  assert.equal(h.panel.hidden, true);
});

test('a small finger wobble remains a tap', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointermove', { clientY: 59 });
  h.pointer('pointerup', { clientY: 59 });
  h.click();
  assert.equal(h.state.plays, 1);
});

for (const delta of [{ clientY: 60 }, { clientX: 60 }, { clientX: 58, clientY: 58 }]) {
  test(`a drag suppresses the generated click: ${JSON.stringify(delta)}`, (t) => {
    const h = harness(t);
    h.pointer('pointerdown');
    assert.equal(h.pointer('pointermove', delta).defaultPrevented, false);
    h.pointer('pointerup', delta);
    h.click();
    assert.equal(h.state.plays, 0);
    assert.equal(h.panel.hidden, false);
  });
}

test('a drag that returns to its starting point still cannot play', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointermove', { clientY: 80 });
  h.pointer('pointerup');
  h.click();
  assert.equal(h.state.plays, 0);
});

test('pointerup displacement is checked even when no move event arrives', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointerup', { clientY: 70 });
  h.click();
  assert.equal(h.state.plays, 0);
});

test('native gesture cancellation suppresses a compatibility click; the next tap plays', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  assert.equal(h.pointer('pointercancel').defaultPrevented, false);
  h.click({ pointerType: undefined });
  assert.equal(h.state.plays, 0);
  assert.equal(h.panel.hidden, false);
  h.tap({ pointerId: 2 });
  assert.equal(h.state.plays, 1);
});

test('scrolling during a touch suppresses a click even with no measured movement', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.scroll();
  h.scrollEnd();
  h.pointer('pointerup');
  h.click();
  assert.equal(h.state.plays, 0);
});

test('a changed list offset is caught before its queued scroll event', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointerup');
  h.items.scrollTop = 4;
  h.click();
  assert.equal(h.state.plays, 0);
  assert.equal(h.panel.hidden, false);
});

test('a changed sidebar offset is caught before its queued scroll event', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.sidebar.scrollTop = 4;
  h.pointer('pointerup');
  h.click();
  assert.equal(h.state.plays, 0);
});

test('the touch that stops momentum cannot play; a subsequent tap can', (t) => {
  const h = harness(t);
  h.scroll();
  h.pointer('pointerdown');
  h.scrollEnd();
  h.pointer('pointerup');
  h.click();
  assert.equal(h.state.plays, 0);
  assert.equal(h.panel.hidden, false);
  h.tap({ pointerId: 2 });
  assert.equal(h.state.plays, 1);
});

test('sidebar momentum also blocks the first touch on a track', (t) => {
  const h = harness(t);
  h.scroll(h.sidebar);
  h.tap();
  assert.equal(h.state.plays, 0);
});

test('unrelated scrolling does not block a tap', (t) => {
  const h = harness(t);
  h.scroll(new EventTarget());
  h.tap();
  assert.equal(h.state.plays, 1);
});

test('without scrollend, a quiet scroll interval permits a fresh tap', (t) => {
  const h = harness(t);
  h.scroll();
  t.mock.timers.tick(151);
  h.tap();
  assert.equal(h.state.plays, 1);
});

test('ending one scroll container does not end momentum in another', (t) => {
  const h = harness(t);
  h.scroll();
  h.scroll(h.sidebar);
  h.scrollEnd();
  h.tap();
  assert.equal(h.state.plays, 0);
});

test('a second touch cancels activation during a multi-touch gesture', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointerdown', { pointerId: 2, isPrimary: false });
  h.pointer('pointerup', { pointerId: 2, isPrimary: false });
  h.pointer('pointerup');
  h.click();
  assert.equal(h.state.plays, 0);
});

test('mouse clicks still play after a cancelled touch and during scrolling', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointercancel');
  h.scroll();
  h.tap({ pointerType: 'mouse' });
  assert.equal(h.state.plays, 1);
});

test('keyboard and assistive clicks still play after a cancelled touch', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.pointer('pointercancel');
  h.click({ detail: 0, pointerType: '', pointerId: -1 });
  assert.equal(h.state.plays, 1);
});

test('closing and reopening clears stale gestures and scrolling', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.scroll();
  h.close();
  h.open();
  h.tap();
  assert.equal(h.state.plays, 1);
});

test('a persisted playlist rebuilds its input listeners after navigation', (t) => {
  const h = harness(t);
  h.pointer('pointerdown');
  h.scroll();
  h.dispatch(h.document, 'astro:before-swap');
  h.dispatch(h.document, 'astro:page-load');
  h.tap();
  assert.equal(h.state.plays, 1);
});

test('a late compatibility click cannot activate an already closed playlist', (t) => {
  const h = harness(t);
  h.tap();
  h.click({ pointerType: undefined });
  assert.equal(h.state.plays, 1);
});
