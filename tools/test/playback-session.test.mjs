import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaybackSession } from '../../src/scripts/playback-session.ts';
import { parsePlaylist } from '../../src/scripts/playlist.ts';

const playlistUrl = 'https://example.test/blog/audio/playlist.json';
const defaultCover = '/image/cover.svg';
const first = { title: 'First', src: 'first.mp3' };
const second = { title: 'Second', src: 'second.mp3', artist: 'Artist' };
const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => value });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise((done) => setImmediate(done));

function harness(t, mode = 'list-loop') {
  const listeners = new Set();
  const notices = [];
  const states = [];
  const requests = [];
  const replies = [];
  const timers = new Set();
  const calls = { sources: [], plays: 0, pauses: 0, seeks: [], reloads: 0 };
  let playResult = () => Promise.resolve();
  const audio = {
    paused: true, ended: false, hasError: false, currentTime: 0, duration: 100, source: null,
    setSource(source) { calls.sources.push(source); this.source = source; this.currentTime = 0; this.ended = false; this.hasError = false; },
    play() { calls.plays++; this.paused = false; this.ended = false; dispatch('play'); return playResult(); },
    pause() { calls.pauses++; this.paused = true; dispatch('pause'); },
    seek(seconds) { calls.seeks.push(seconds); this.currentTime = seconds; dispatch('timeupdate'); },
    reload() { calls.reloads++; this.hasError = false; },
    listen(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const dispatch = (event) => { for (const listener of listeners) listener(event); };
  const session = createPlaybackSession({
    audio, playlistUrl, defaultCover, base: '/blog/', defaultMode: mode,
    onChange(state, notice) { states.push(state); if (notice) notices.push(notice); },
    fetchPlaylist(url, options) {
      requests.push({ url, ...options });
      const reply = replies.shift();
      if (reply instanceof Error) return Promise.reject(reply);
      return Promise.resolve(reply ?? response([first, second]));
    },
    scheduleTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 15000);
      timers.add(callback);
      return () => timers.delete(callback);
    },
  });
  t.after(() => session.dispose());
  return { session, audio, calls, requests, replies, timers, notices, states, listeners, dispatch,
    setPlay: (result) => { playResult = result; },
    expire: () => { for (const callback of [...timers]) { timers.delete(callback); callback(); } },
    snapshot: () => session.getSnapshot(),
  };
}

test('playlist URLs resolve from the JSON location with an explicit deployment base', () => {
  const parsed = parsePlaylist([{ title: ' Local ', src: 'song.mp3', cover: '../covers/art.svg' }, { title: 'Root', src: '/audio/root.mp3' }, { title: 'Remote', src: 'https://cdn.example.test/song.mp3' }], playlistUrl, defaultCover, '/blog/');
  assert.equal(parsed[0].title, 'Local');
  assert.equal(parsed[0].src, 'https://example.test/blog/audio/song.mp3');
  assert.equal(parsed[0].cover, 'https://example.test/blog/covers/art.svg');
  assert.equal(parsed[1].src, 'https://example.test/blog/audio/root.mp3');
  assert.equal(parsed[1].cover, 'https://example.test/blog/image/cover.svg');
  assert.equal(parsed[2].src, 'https://cdn.example.test/song.mp3');
  for (const value of [null, {}, [{ title: '', src: 'a.mp3' }], [{ title: 'Bad', src: '//elsewhere/a.mp3' }], [{ title: 'Bad', src: 'http://elsewhere/a.mp3' }], [{ title: 'Bad', src: 'javascript:alert(1)' }], [{ title: 'Bad', src: 'a\\b.mp3' }], [{ title: 'Bad', src: 'a.mp3', artist: [] }]]) {
    assert.throws(() => parsePlaylist(value, playlistUrl, defaultCover, '/blog/'));
  }
});

test('initial loading selects a track without autoplay or polling', async (t) => {
  const h = harness(t);
  assert.equal(h.requests.length, 0);
  assert.equal(h.snapshot().loadStatus, 'initial');
  await h.session.refresh();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, playlistUrl);
  assert.equal(h.requests[0].cache, 'no-store');
  assert.equal(h.snapshot().tracks[0].src, 'https://example.test/blog/audio/first.mp3');
  assert.equal(h.snapshot().loadStatus, 'ready');
  assert.equal(h.calls.plays, 0);
  assert.equal(h.snapshot().playing, false);
  assert.equal(h.timers.size, 0);
  assert(Object.isFrozen(h.snapshot()) && Object.isFrozen(h.snapshot().tracks[0]));
});

for (const playing of [true, false]) {
  test(`refresh retains the same URL, progress and ${playing ? 'playing' : 'paused'} state after reordering`, async (t) => {
    const h = harness(t);
    await h.session.refresh();
    if (playing) await h.session.togglePlayback();
    h.audio.currentTime = 42;
    const before = structuredClone(h.calls);
    h.replies.push(response([second, { ...first, title: 'Renamed', cover: 'new.svg' }]));
    await h.session.refresh();
    assert.equal(h.snapshot().index, 1);
    assert.equal(h.snapshot().tracks[1].title, 'Renamed');
    assert.equal(h.audio.currentTime, 42);
    assert.equal(h.snapshot().playing, playing);
    assert.deepEqual(h.calls, before);
    const unchanged = h.snapshot().tracks;
    h.replies.push(response([second, { ...first, title: 'Renamed', cover: 'new.svg' }]));
    await h.session.refresh();
    assert.equal(h.snapshot().tracks, unchanged);
    assert.deepEqual(h.calls, before);
  });
}

for (const fresh of [[second], []]) {
  test(`removing the current song ${fresh.length ? 'selects a replacement without playing' : 'clears the audio source'}`, async (t) => {
    const h = harness(t);
    await h.session.refresh();
    await h.session.togglePlayback();
    h.audio.currentTime = 55;
    h.replies.push(response(fresh));
    await h.session.refresh();
    assert.equal(h.audio.paused, true);
    assert.equal(h.audio.currentTime, 0);
    assert.equal(h.calls.plays, 1);
    assert.equal(h.snapshot().tracks.length, fresh.length);
    assert.equal(h.audio.source, fresh.length ? 'https://example.test/blog/audio/second.mp3' : null);
    if (!fresh.length) { assert.equal(h.snapshot().duration, 0); assert.equal(h.snapshot().currentTime, 0); }
  });
}

for (const [reason, reply] of [
  ['network', new Error('offline')], ['HTTP', response(null, 503)],
  ['JSON', { ...response(null), json: async () => { throw new Error('bad JSON'); } }],
  ['validation', response([{ title: 'Missing source' }])],
]) {
  test(`${reason} failure preserves the last usable playlist and current playback`, async (t) => {
    const h = harness(t);
    await h.session.refresh();
    await h.session.togglePlayback();
    h.audio.currentTime = 31;
    const tracks = h.snapshot().tracks;
    const before = structuredClone(h.calls);
    h.replies.push(reply);
    await h.session.refresh();
    assert.equal(h.snapshot().tracks, tracks);
    assert.equal(h.snapshot().loadStatus, 'error');
    assert.equal(h.snapshot().hasLoaded, true);
    assert.equal(h.snapshot().playing, true);
    assert.equal(h.audio.currentTime, 31);
    assert.deepEqual(h.calls, before);
    assert.equal(h.timers.size, 0);
  });
}

test('a failed first load remains retryable and an empty list is a successful load', async (t) => {
  const h = harness(t);
  h.replies.push(new Error('offline'));
  await h.session.refresh();
  assert.equal(h.snapshot().hasLoaded, false);
  assert.equal(h.snapshot().loadStatus, 'error');
  await h.session.togglePlayback();
  h.session.skip(1);
  h.session.seek(50);
  assert.equal(h.calls.plays, 0);
  assert.equal(h.calls.seeks.length, 0);
  h.replies.push(response([]));
  await h.session.refresh();
  assert.equal(h.snapshot().hasLoaded, true);
  assert.equal(h.snapshot().loadStatus, 'ready');
  assert.equal(h.snapshot().tracks.length, 0);
});

test('concurrent refresh requests share one in-flight fetch', async (t) => {
  const h = harness(t);
  const network = deferred();
  h.replies.push(network.promise);
  const pending = h.session.refresh();
  await h.session.refresh();
  assert.equal(h.requests.length, 1);
  assert.equal(h.snapshot().loadStatus, 'loading');
  network.resolve(response([first]));
  await pending;
  assert.equal(h.snapshot().tracks.length, 1);
});

test('timeout aborts a stalled fetch and a late response cannot replace a newer result', async (t) => {
  const h = harness(t);
  await h.session.refresh();
  await h.session.togglePlayback();
  h.audio.currentTime = 12;
  const network = deferred();
  h.replies.push(network.promise);
  const pending = h.session.refresh();
  h.expire();
  await pending;
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(h.snapshot().loadStatus, 'error');
  assert.equal(h.audio.currentTime, 12);
  assert.equal(h.snapshot().playing, true);
  h.replies.push(response([second]));
  await h.session.refresh();
  network.resolve(response([{ title: 'Stale', src: 'stale.mp3' }]));
  await flush();
  assert.equal(h.snapshot().tracks[0].title, 'Second');
  assert.equal(h.snapshot().loadStatus, 'ready');
  assert.equal(h.timers.size, 0);
});

test('pausing invalidates a pending play promise before its success arrives', async (t) => {
  const h = harness(t);
  await h.session.refresh();
  const oldPlay = deferred();
  h.setPlay(() => oldPlay.promise);
  const pending = h.session.togglePlayback();
  await h.session.togglePlayback();
  const noticeCount = h.notices.length;
  oldPlay.resolve();
  await pending;
  assert.equal(h.snapshot().playing, false);
  assert.equal(h.snapshot().playbackError, null);
  assert.equal(h.notices.length, noticeCount);
  assert.equal(h.notices.at(-1), 'paused');
});

for (const outcome of ['resolve', 'reject']) {
  test(`switching songs ignores the old play promise's late ${outcome}`, async (t) => {
    const h = harness(t);
    await h.session.refresh();
    const oldPlay = deferred();
    h.setPlay(() => oldPlay.promise);
    const pending = h.session.togglePlayback();
    h.setPlay(() => Promise.resolve());
    h.session.select(1);
    await flush();
    const noticeCount = h.notices.length;
    oldPlay[outcome](outcome === 'reject' ? new Error('old failure') : undefined);
    await pending;
    assert.equal(h.snapshot().index, 1);
    assert.equal(h.snapshot().playing, true);
    assert.equal(h.snapshot().playbackError, null);
    assert.equal(h.notices.length, noticeCount);
    assert.equal(h.notices.at(-1), 'playing');
  });
}

test('clearing the playlist invalidates an outstanding play result', async (t) => {
  const h = harness(t);
  await h.session.refresh();
  const oldPlay = deferred();
  h.setPlay(() => oldPlay.promise);
  const pending = h.session.togglePlayback();
  h.replies.push(response([]));
  await h.session.refresh();
  oldPlay.resolve();
  await pending;
  assert.equal(h.snapshot().tracks.length, 0);
  assert.equal(h.snapshot().playing, false);
  assert.equal(h.notices.at(-1), 'playlist-updated');
});

test('current play errors are reported and native AbortError is ignored', async (t) => {
  const h = harness(t);
  await h.session.refresh();
  h.setPlay(() => { h.audio.paused = true; return Promise.reject(new Error('blocked')); });
  await h.session.togglePlayback();
  assert.equal(h.snapshot().playbackError, 'playback');
  assert.equal(h.notices.at(-1), 'playback-failed');
  h.setPlay(() => { h.audio.paused = true; return Promise.reject(new DOMException('cancelled', 'AbortError')); });
  h.notices.length = 0;
  await h.session.togglePlayback();
  assert.equal(h.snapshot().playbackError, null);
  assert(!h.notices.includes('playback-failed'));
});

test('native media errors allow a reload and retry through the same session', async (t) => {
  const h = harness(t);
  await h.session.refresh();
  h.audio.hasError = true;
  h.dispatch('error');
  assert.equal(h.snapshot().playbackError, 'track');
  assert.equal(h.notices.at(-1), 'track-load-failed');
  await h.session.togglePlayback();
  assert.equal(h.calls.reloads, 1);
  assert.equal(h.snapshot().playbackError, null);
  assert.equal(h.snapshot().playing, true);
});

for (const mode of ['sequential', 'list-loop', 'single-loop']) {
  test(`${mode} handles the last track ending without changing its rules`, async (t) => {
    const h = harness(t, mode);
    await h.session.refresh();
    h.session.skip(-1);
    await h.session.togglePlayback();
    const assignments = h.calls.sources.length;
    h.audio.currentTime = 100;
    h.audio.paused = true;
    h.audio.ended = true;
    h.dispatch('ended');
    await flush();
    assert.equal(h.snapshot().mode, mode);
    if (mode === 'sequential') {
      assert.equal(h.snapshot().index, 1);
      assert.equal(h.snapshot().playing, false);
      assert.equal(h.notices.at(-1), 'playlist-ended');
    } else if (mode === 'list-loop') {
      assert.equal(h.snapshot().index, 0);
      assert.equal(h.snapshot().playing, true);
    } else {
      assert.equal(h.snapshot().index, 1);
      assert.equal(h.snapshot().playing, true);
      assert.equal(h.audio.currentTime, 0);
      assert.equal(h.calls.sources.length, assignments);
    }
  });
}

test('skipping preserves paused playback, mode cycling is local, and seeking uses media duration', async (t) => {
  const h = harness(t, 'sequential');
  await h.session.refresh();
  h.session.skip(-1);
  assert.equal(h.snapshot().index, 1);
  assert.equal(h.calls.plays, 0);
  h.session.skip(1);
  assert.equal(h.snapshot().index, 0);
  h.session.cycleMode();
  assert.equal(h.snapshot().mode, 'list-loop');
  assert.equal(h.snapshot().nextMode, 'single-loop');
  h.session.cycleMode(); h.session.cycleMode();
  assert.equal(h.snapshot().mode, 'sequential');
  h.audio.duration = 200;
  h.session.seek(25);
  assert.equal(h.snapshot().currentTime, 50);
  h.session.seek(120);
  assert.equal(h.snapshot().currentTime, 200);
  h.audio.duration = NaN;
  h.session.seek(50);
  assert.equal(h.snapshot().duration, 0);
  assert.equal(h.calls.seeks.length, 2);
  assert.equal(h.requests.length, 1);
});

test('disposing aborts requests, detaches audio and ignores late results and commands', async (t) => {
  const h = harness(t);
  await h.session.refresh();
  const oldPlay = deferred();
  h.setPlay(() => oldPlay.promise);
  const playing = h.session.togglePlayback();
  const network = deferred();
  h.replies.push(network.promise);
  const loading = h.session.refresh();
  h.session.dispose();
  await loading;
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.audio.source, null);
  const notifications = h.states.length;
  const before = structuredClone(h.calls);
  oldPlay.resolve(); network.resolve(response([first]));
  await playing;
  await flush();
  await h.session.refresh(); await h.session.togglePlayback();
  h.session.select(1); h.session.skip(1); h.session.seek(50); h.session.cycleMode(); h.session.dispose();
  h.dispatch('play');
  assert.equal(h.states.length, notifications);
  assert.deepEqual(h.calls, before);
  assert.equal(h.requests.length, 2);
});
