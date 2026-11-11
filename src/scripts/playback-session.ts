import { playbackModes, type PlaybackMode } from '../config/music.config.ts';
import { parsePlaylist, type PlaylistTrack } from './playlist.ts';

export const playbackAudioEvents = ['play', 'playing', 'pause', 'ended', 'error', 'timeupdate', 'loadedmetadata', 'durationchange', 'canplay', 'emptied', 'seeked', 'ratechange'] as const;
type AudioEvent = typeof playbackAudioEvents[number];

/** Audio operations and observations used by a session, independent of DOM nodes. */
export interface PlaybackAudio {
  readonly paused: boolean;
  readonly ended: boolean;
  readonly currentSrc: string;
  readonly readyState: number;
  readonly seekable: TimeRanges;
  readonly currentTime: number;
  readonly duration: number;
  setSource(source: string | null): void;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  reload(): void;
  listen(listener: (event: AudioEvent) => void): () => void;
}

export type TrackFailure = { kind: 'http'; status: number } | { kind: 'network' | 'empty' | 'decode' | 'playback' };
export type PlaybackNotice = 'track-selected' | 'playing' | 'paused' | 'mode-changed' | 'playlist-ended' | 'track-load-failed' | 'playback-failed' | 'playback-blocked' | 'playlist-updated';
export interface PlaybackSnapshot {
  readonly tracks: readonly Readonly<PlaylistTrack>[];
  readonly index: number;
  readonly mode: PlaybackMode;
  readonly nextMode: PlaybackMode;
  readonly loadStatus: 'initial' | 'loading' | 'ready' | 'error';
  readonly hasLoaded: boolean;
  readonly trackStatus: 'idle' | 'downloading' | 'initializing' | 'ready' | 'error';
  readonly loadedTrack: Readonly<PlaylistTrack> | null;
  readonly wantPlaying: boolean;
  readonly canSeek: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly trackError: TrackFailure | null;
}

interface AudioDownload {
  src: string;
  controller: AbortController;
  promise?: Promise<Blob | undefined>;
  blob?: Blob;
  error?: TrackFailure;
}

interface SessionOptions {
  audio: PlaybackAudio;
  playlistUrl: string;
  defaultCover: string;
  base: string;
  defaultMode: PlaybackMode;
  onChange: (snapshot: PlaybackSnapshot, notice?: PlaybackNotice) => void;
  fetchPlaylist?: (url: string, options: { cache: 'no-store'; signal: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
  fetchAudio?: (url: string, options: { signal: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'blob'>>;
  scheduleTimeout?: (callback: () => void, milliseconds: number) => () => void;
}

/** One session owns the current Blob and one download/candidate. */
export function createPlaybackSession({ audio, playlistUrl, defaultCover, base, defaultMode, onChange,
  fetchPlaylist = fetch, fetchAudio = fetch,
  scheduleTimeout = (callback, milliseconds) => { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer); },
}: SessionOptions) {
  let tracks: PlaybackSnapshot['tracks'] = Object.freeze([]);
  let index = 0;
  let mode = playbackModes.find((value) => value === defaultMode) ?? 'list-loop';
  let loadStatus: PlaybackSnapshot['loadStatus'] = 'initial';
  let hasLoaded = false;
  let trackStatus: PlaybackSnapshot['trackStatus'] = 'idle';
  let trackError: TrackFailure | null = null;
  let wantPlaying = false;
  let loaded: { src: string; url: string } | undefined;
  let candidate: AudioDownload | undefined;
  let request = 0;
  let pendingPlay: number | undefined;
  let loading: AbortController | undefined;
  let disposed = false;
  const currentReady = () => trackStatus === 'ready' && loaded !== undefined && loaded.src === tracks[index]?.src;
  const getSnapshot = (): PlaybackSnapshot => {
    const ready = currentReady();
    const duration = ready && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    return Object.freeze({
      tracks, index, mode, nextMode: playbackModes[(playbackModes.indexOf(mode) + 1) % playbackModes.length], loadStatus, hasLoaded,
      trackStatus, wantPlaying,
      loadedTrack: ready && audio.currentSrc === loaded?.url ? tracks.find((track) => track.src === loaded?.src) ?? null : null,
      canSeek: ready && duration > 0 && audio.seekable.length > 0,
      currentTime: ready && Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0, duration,
      trackError,
    });
  };
  const emit = (notice?: PlaybackNotice) => { if (!disposed) onChange(getSnapshot(), notice); };
  const invalidatePlay = () => { request++; pendingPlay = undefined; };
  const cancelCandidate = () => { candidate?.controller.abort(); candidate = undefined; };
  const releaseLoaded = () => {
    const previous = loaded;
    loaded = undefined;
    audio.pause();
    audio.setSource(null);
    if (previous) URL.revokeObjectURL(previous.url);
  };
  const failTrack = (failure: TrackFailure) => {
    invalidatePlay();
    wantPlaying = false;
    trackError = failure;
    trackStatus = 'error';
    cancelCandidate();
    releaseLoaded();
    emit(failure.kind === 'playback' ? 'playback-failed' : 'track-load-failed');
  };
  const downloadAudio = (src: string) => {
    const job: AudioDownload = { src, controller: new AbortController() };
    job.promise = (async () => {
      try {
        const response = await fetchAudio(src, { signal: job.controller.signal });
        if (!response.ok) { job.error = { kind: 'http', status: response.status }; return; }
        const blob = await response.blob();
        job.controller.signal.throwIfAborted();
        if (!blob.size) { job.error = { kind: 'empty' }; return; }
        job.blob = blob;
        return blob;
      } catch {
        if (!job.controller.signal.aborted) job.error = { kind: 'network' };
      }
    })();
    return job;
  };
  const prefetchNext = () => {
    if (!currentReady()) return;
    const nextIndex = index < tracks.length - 1 ? index + 1 : mode === 'list-loop' ? 0 : -1;
    const next = mode !== 'single-loop' && nextIndex >= 0 ? tracks[nextIndex] : undefined;
    if (candidate && candidate.src !== next?.src) cancelCandidate();
    if (next && next.src !== loaded?.src && !candidate && !audio.paused) candidate = downloadAudio(next.src);
  };
  const start = async (): Promise<void> => {
    if (disposed || !tracks.length) return;
    wantPlaying = true;
    if (trackStatus === 'idle' || trackStatus === 'error') { trackError = null; await loadTarget(); return; }
    if (!currentReady() || pendingPlay !== undefined) { emit(); return; }
    if (audio.ended) audio.seek(0);
    const current = ++request;
    pendingPlay = current;
    try {
      const started = audio.play();
      emit();
      await started;
      if (!disposed && current === request) emit('playing');
    } catch (error) {
      if (disposed || current !== request) return;
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        wantPlaying = false;
        audio.pause();
        emit(name === 'NotAllowedError' ? 'playback-blocked' : 'paused');
      } else failTrack({ kind: 'playback' });
    } finally {
      if (!disposed && current === request) pendingPlay = undefined;
    }
  };
  const markReady = () => {
    if (trackStatus !== 'initializing' || !loaded || audio.currentSrc !== loaded.url || audio.readyState < 3) return;
    trackStatus = 'ready';
    if (wantPlaying) void start();
    else emit();
  };
  const loadTarget = async (notice?: PlaybackNotice) => {
    if (disposed || !tracks.length) return;
    trackStatus = 'downloading';
    releaseLoaded();
    const src = tracks[index].src;
    if (candidate?.src !== src || candidate.error) {
      cancelCandidate();
      candidate = downloadAudio(src);
    }
    const job = candidate;
    emit(notice);
    const blob = job.blob ?? await job.promise;
    if (disposed || candidate !== job || tracks[index]?.src !== src) return;
    if (!blob) { failTrack(job.error ?? { kind: 'network' }); return; }
    candidate = undefined;
    try {
      loaded = { src, url: URL.createObjectURL(blob) };
      trackStatus = 'initializing';
      audio.setSource(loaded.url);
      emit();
      audio.reload();
    } catch { failTrack({ kind: 'decode' }); }
  };
  const pause = () => {
    if (disposed) return;
    wantPlaying = false;
    invalidatePlay();
    audio.pause();
    emit('paused');
  };
  const select = (target: number, resume: boolean) => {
    if (disposed || !tracks.length || !Number.isInteger(target)) return;
    invalidatePlay();
    audio.pause();
    index = (target % tracks.length + tracks.length) % tracks.length;
    wantPlaying = resume;
    trackError = null;
    if (currentReady()) {
      prefetchNext();
      emit('track-selected');
      if (wantPlaying) void start();
    } else void loadTarget('track-selected');
  };
  const applyPlaylist = (fresh: PlaylistTrack[]) => {
    if (JSON.stringify(fresh) === JSON.stringify(tracks)) return;
    const currentSource = tracks[index]?.src;
    tracks = Object.freeze(fresh.map((track) => Object.freeze(track)));
    const retained = tracks.findIndex((track) => track.src === currentSource);
    index = retained >= 0 ? retained : 0;
    if (retained < 0) {
      invalidatePlay();
      cancelCandidate();
      wantPlaying = false;
      trackError = null;
      trackStatus = 'idle';
      releaseLoaded();
    } else {
      if (candidate && !tracks.some((track) => track.src === candidate?.src)) cancelCandidate();
      prefetchNext();
    }
  };
  const stopListening = audio.listen((event) => {
    if (disposed) return;
    if (event === 'ended' && currentReady()) {
      invalidatePlay();
      if (mode === 'single-loop') void start();
      else if (index < tracks.length - 1) select(index + 1, true);
      else if (mode === 'list-loop' && tracks.length > 1) select(0, true);
      else if (mode === 'list-loop') void start();
      else { wantPlaying = false; emit('playlist-ended'); }
    } else if (event === 'error' && loaded?.src === tracks[index]?.src && audio.currentSrc === loaded?.url) {
      failTrack({ kind: 'decode' });
    } else if (event === 'canplay') {
      markReady();
    } else {
      if (event === 'play' && currentReady()) wantPlaying = true;
      if (event === 'playing') prefetchNext();
      if (event === 'pause' && currentReady() && audio.paused && !audio.ended) { wantPlaying = false; invalidatePlay(); }
      emit();
    }
  });
  const seekTo = (seconds: number) => {
    if (disposed || !getSnapshot().canSeek || !Number.isFinite(seconds)) return;
    const target = Math.min(audio.duration, Math.max(0, seconds));
    let position = target;
    let distance = Infinity;
    for (let range = 0; range < audio.seekable.length; range++) {
      const nearest = Math.min(audio.seekable.end(range), Math.max(audio.seekable.start(range), target));
      if (Math.abs(nearest - target) < distance) { position = nearest; distance = Math.abs(nearest - target); }
    }
    try { audio.seek(position); } catch { /* The actual position remains the source of truth. */ }
    emit();
  };
  return {
    getSnapshot, play: start, pause, seekTo,
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
        if (loading === controller) loading = undefined;
      }
    },
    async togglePlayback() {
      if (wantPlaying) pause();
      else await start();
    },
    retry() {
      if (disposed || !tracks.length) return;
      invalidatePlay();
      trackError = null;
      wantPlaying = true;
      void loadTarget();
    },
    select: (target: number) => select(target, true),
    skip: (direction: -1 | 1) => select(index + direction, wantPlaying),
    seek(percent: number) { if (Number.isFinite(percent)) seekTo(percent / 100 * audio.duration); },
    cycleMode() {
      if (disposed) return;
      mode = playbackModes[(playbackModes.indexOf(mode) + 1) % playbackModes.length];
      prefetchNext();
      emit('mode-changed');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidatePlay();
      cancelCandidate();
      loading?.abort();
      stopListening();
      releaseLoaded();
    },
  };
}
