import { playbackModes, type PlaybackMode } from '../config/music.config.ts';
import { parsePlaylist, type PlaylistTrack } from './playlist.ts';

export const playbackAudioEvents = ['play', 'pause', 'ended', 'error', 'timeupdate', 'loadedmetadata', 'durationchange', 'emptied'] as const;
type AudioEvent = typeof playbackAudioEvents[number];

/** Audio operations and observations used by a session, independent of DOM nodes. */
export interface PlaybackAudio {
  readonly paused: boolean;
  readonly ended: boolean;
  readonly hasError: boolean;
  readonly currentTime: number;
  readonly duration: number;
  setSource(source: string | null): void;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  reload(): void;
  listen(listener: (event: AudioEvent) => void): () => void;
}

export type PlaybackNotice = 'track-selected' | 'playing' | 'paused' | 'mode-changed' | 'playlist-ended' | 'track-load-failed' | 'playback-failed' | 'playlist-updated';
export interface PlaybackSnapshot {
  readonly tracks: readonly Readonly<PlaylistTrack>[];
  readonly index: number;
  readonly mode: PlaybackMode;
  readonly nextMode: PlaybackMode;
  readonly loadStatus: 'initial' | 'loading' | 'ready' | 'error';
  readonly hasLoaded: boolean;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackError: 'playback' | 'track' | null;
}

interface SessionOptions {
  audio: PlaybackAudio;
  playlistUrl: string;
  defaultCover: string;
  base: string;
  defaultMode: PlaybackMode;
  onChange: (snapshot: PlaybackSnapshot, notice?: PlaybackNotice) => void;
  fetchPlaylist?: (url: string, options: { cache: 'no-store'; signal: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
  scheduleTimeout?: (callback: () => void, milliseconds: number) => () => void;
}

/** One session belongs to one persistent player; refreshing never starts playback. */
export function createPlaybackSession({ audio, playlistUrl, defaultCover, base, defaultMode, onChange,
  fetchPlaylist = fetch,
  scheduleTimeout = (callback, milliseconds) => { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer); },
}: SessionOptions) {
  let tracks: PlaybackSnapshot['tracks'] = Object.freeze([]);
  let index = 0;
  let mode = playbackModes.find((value) => value === defaultMode) ?? 'list-loop';
  let loadStatus: PlaybackSnapshot['loadStatus'] = 'initial';
  let hasLoaded = false;
  let playbackError: PlaybackSnapshot['playbackError'] = null;
  let request = 0;
  let pendingPlay: number | undefined;
  let loading: AbortController | undefined;
  let disposed = false;
  const getSnapshot = (): PlaybackSnapshot => Object.freeze({
    tracks, index, mode, nextMode: playbackModes[(playbackModes.indexOf(mode) + 1) % playbackModes.length], loadStatus, hasLoaded,
    playing: tracks.length > 0 && !audio.paused && !audio.ended,
    currentTime: tracks.length && Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
    duration: tracks.length && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0,
    playbackError,
  });
  const emit = (notice?: PlaybackNotice) => { if (!disposed) onChange(getSnapshot(), notice); };
  const invalidatePlay = () => { request++; pendingPlay = undefined; };
  const start = async () => {
    if (disposed || !tracks.length) return;
    const current = ++request;
    pendingPlay = current;
    playbackError = null;
    try {
      const started = audio.play();
      emit();
      await started;
      if (!disposed && current === request) emit('playing');
    } catch (error) {
      if (disposed || current !== request || (error instanceof Error && error.name === 'AbortError')) return;
      playbackError = 'playback';
      emit('playback-failed');
    } finally {
      if (!disposed && current === request) { pendingPlay = undefined; emit(); }
    }
  };
  const select = (target: number, resume: boolean) => {
    if (disposed || !tracks.length || !Number.isInteger(target)) return;
    invalidatePlay();
    index = (target % tracks.length + tracks.length) % tracks.length;
    playbackError = null;
    audio.setSource(tracks[index].src);
    emit('track-selected');
    if (resume) void start();
  };
  const applyPlaylist = (fresh: PlaylistTrack[]) => {
    if (JSON.stringify(fresh) === JSON.stringify(tracks)) return;
    const currentSource = tracks[index]?.src;
    tracks = Object.freeze(fresh.map((track) => Object.freeze(track)));
    const retained = tracks.findIndex((track) => track.src === currentSource);
    index = retained >= 0 ? retained : 0;
    if (retained < 0) {
      invalidatePlay();
      playbackError = null;
      audio.pause();
      audio.setSource(null);
      if (tracks.length) select(0, false);
    }
  };
  const stopListening = audio.listen((event) => {
    if (disposed) return;
    if (event === 'ended' && tracks.length) {
      invalidatePlay();
      if (mode === 'single-loop') { audio.seek(0); void start(); }
      else if (index < tracks.length - 1) select(index + 1, true);
      else if (mode === 'list-loop') select(0, true);
      else emit('playlist-ended');
    } else if (event === 'error' && tracks.length) {
      invalidatePlay();
      playbackError = 'track';
      emit('track-load-failed');
    } else {
      if (event === 'pause' && audio.paused) invalidatePlay();
      emit();
    }
  });
  return {
    getSnapshot,
    async refresh() {
      if (disposed || loading) return;
      const controller = new AbortController();
      loading = controller;
      loadStatus = 'loading';
      emit();
      let rejectAbort: () => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', rejectAbort, { once: true });
      });
      const cancelTimeout = scheduleTimeout(() => controller.abort(), 15000);
      try {
        const read = async () => {
          const response = await fetchPlaylist(playlistUrl, { cache: 'no-store', signal: controller.signal });
          if (!response.ok) throw new Error(`Playlist HTTP ${response.status}`);
          return parsePlaylist(await response.json(), playlistUrl, defaultCover, base);
        };
        const fresh = await Promise.race([read(), aborted]);
        if (disposed || loading !== controller) return;
        hasLoaded = true;
        applyPlaylist(fresh);
        loadStatus = 'ready';
        emit('playlist-updated');
      } catch {
        if (!disposed && loading === controller) { loadStatus = 'error'; emit(); }
      } finally {
        cancelTimeout();
        controller.signal.removeEventListener('abort', rejectAbort!);
        if (loading === controller) { loading = undefined; emit(); }
      }
    },
    async togglePlayback() {
      if (disposed || !tracks.length) return;
      if (!audio.paused || pendingPlay !== undefined) {
        invalidatePlay();
        audio.pause();
        emit('paused');
      } else {
        if (audio.hasError) audio.reload();
        if (audio.ended) audio.seek(0);
        await start();
      }
    },
    select: (target: number) => select(target, true),
    skip: (direction: -1 | 1) => select(index + direction, !audio.paused || pendingPlay !== undefined),
    seek(percent: number) {
      if (disposed || !tracks.length || !Number.isFinite(percent) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.seek(Math.min(100, Math.max(0, percent)) / 100 * audio.duration);
      emit();
    },
    cycleMode() {
      if (disposed) return;
      mode = playbackModes[(playbackModes.indexOf(mode) + 1) % playbackModes.length];
      emit('mode-changed');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidatePlay();
      loading?.abort();
      stopListening();
      audio.pause();
      audio.setSource(null);
    },
  };
}
