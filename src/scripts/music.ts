import { musicConfig, type PlaybackMode } from '../config/music.config';
import { siteConfig } from '../config/site.config';
import { getUi } from '../i18n/ui';
import { withBase } from './paths';
import { createPlaybackSession, playbackAudioEvents, type PlaybackSnapshot, type PlaybackNotice } from './playback-session';
import { createPlaylistPanel } from './playlist-panel';

const ui = getUi(siteConfig.lang);
const playbackModeIcons: Record<PlaybackMode, string> = {
  sequential: 'ri-play-list-line', 'list-loop': 'ri-repeat-line', 'single-loop': 'ri-repeat-one-line',
};
const formatTime = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

function mountPlayer(player: HTMLElement) {
  const events = new AbortController();
  const { signal } = events;
  const audio = player.querySelector<HTMLAudioElement>('[data-audio]')!;
  const play = player.querySelector<HTMLButtonElement>('[data-play]')!;
  const previous = player.querySelector<HTMLButtonElement>('[data-previous]')!;
  const next = player.querySelector<HTMLButtonElement>('[data-next]')!;
  const seek = player.querySelector<HTMLInputElement>('[data-seek]')!;
  const modeToggle = player.querySelector<HTMLButtonElement>('[data-playback-mode-toggle]')!;
  const modeIcon = player.querySelector<HTMLElement>('[data-playback-mode-icon]')!;
  const modeLabel = player.querySelector<HTMLElement>('[data-playback-mode-label]')!;
  const playlistItems = player.querySelector<HTMLOListElement>('.playlist-items')!;
  const refresh = player.querySelector<HTMLButtonElement>('[data-playlist-refresh]')!;
  const refreshLabel = player.querySelector<HTMLElement>('[data-refresh-label]')!;
  const feedback = player.querySelector<HTMLElement>('[data-playlist-feedback]')!;
  const progress = player.querySelector<HTMLElement>('[data-progress]')!;
  const title = player.querySelector<HTMLElement>('[data-title]')!;
  const info = player.querySelector<HTMLElement>('[data-track-info]')!;
  const titleViewport = player.querySelector<HTMLElement>('[data-title-viewport]')!;
  const cover = player.querySelector<HTMLElement>('[data-cover]')!;
  const status = player.querySelector<HTMLElement>('[data-status]')!;
  const defaultCover = withBase(musicConfig.defaultCover);
  const updateTitleOverflow = () => {
    const overflow = Math.max(0, title.scrollWidth - titleViewport.clientWidth);
    info.classList.toggle('has-long-title', overflow > 1);
    info.style.setProperty('--song-overflow', `${overflow}px`);
    info.style.setProperty('--song-marquee-duration', `${Math.max(8, 4 + overflow / 30) - 5}s`);
  };
  const titleResizeObserver = new ResizeObserver(updateTitleOverflow);
  titleResizeObserver.observe(titleViewport);
  titleResizeObserver.observe(title);
  let renderedTracks: PlaybackSnapshot['tracks'] | undefined;
  let renderedIndex = -1;
  const render = (state: PlaybackSnapshot, notice?: PlaybackNotice) => {
    const changedList = renderedTracks !== state.tracks;
    if (changedList) {
      renderedTracks = state.tracks;
      playlistItems.replaceChildren(...state.tracks.map((track, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'playlist-track';
        button.dataset.trackIndex = String(index);
        const label = document.createElement('span');
        label.className = 'playlist-track-title';
        label.textContent = track.title;
        button.append(label);
        if (track.artist) {
          const artist = document.createElement('span');
          artist.className = 'playlist-track-artist';
          artist.textContent = track.artist;
          button.append(artist);
        }
        item.append(button);
        return item;
      }));
    }
    const track = state.tracks[state.index];
    if (changedList || renderedIndex !== state.index) {
      renderedIndex = state.index;
      for (const button of playlistItems.querySelectorAll<HTMLButtonElement>('[data-track-index]')) {
        if (Number(button.dataset.trackIndex) === state.index) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    }
    const firstLoadFailed = state.loadStatus === 'error' && !state.hasLoaded;
    const text = track?.title ?? (firstLoadFailed ? ui.playlistLoadFailed : ui.musicTitle);
    if (title.textContent !== text) { title.textContent = text; updateTitleOverflow(); }
    info.title = state.playbackError === 'playback' ? ui.playbackFailed
      : state.playbackError === 'track' && track ? ui.trackLoadFailed(track.title)
      : track ? track.artist ? `${track.title} — ${track.artist}` : track.title
      : firstLoadFailed ? ui.playlistLoadFailed : state.hasLoaded ? ui.noTracks : ui.playlistLoading;
    cover.style.backgroundImage = `url(${JSON.stringify(track?.cover ?? defaultCover)})`;
    modeIcon.className = playbackModeIcons[state.mode];
    modeLabel.textContent = ui.playbackModes[state.mode];
    modeToggle.title = ui.playbackModes[state.mode];
    modeToggle.setAttribute('aria-label', ui.playbackModeButton(ui.playbackModes[state.mode], ui.playbackModes[state.nextMode]));
    play.disabled = !state.tracks.length;
    previous.disabled = next.disabled = state.tracks.length < 2;
    play.setAttribute('aria-label', state.tracks.length ? state.playing ? ui.pause : ui.play : ui.playNoTracks);
    play.querySelector('span')!.className = state.playing ? 'ri-pause-large-fill' : 'ri-play-large-fill';
    const percent = state.duration ? Math.min(100, state.currentTime / state.duration * 100) : 0;
    seek.disabled = !state.duration;
    seek.value = String(percent);
    seek.setAttribute('aria-valuetext', `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`);
    progress.style.width = `${percent}%`;
    const loading = state.loadStatus === 'loading' || state.loadStatus === 'initial';
    refresh.disabled = state.loadStatus === 'loading';
    if (loading) playlistItems.setAttribute('aria-busy', 'true');
    else playlistItems.removeAttribute('aria-busy');
    feedback.hidden = state.loadStatus === 'ready' && state.tracks.length > 0;
    feedback.textContent = loading ? ui.playlistLoading
      : state.loadStatus === 'error' ? state.hasLoaded ? ui.playlistRefreshFailed : ui.playlistLoadFailed
      : state.tracks.length ? '' : ui.emptyPlaylist;
    refreshLabel.textContent = state.loadStatus === 'error' ? ui.retryPlaylist : ui.refreshPlaylist;
    if (notice) {
      const message = {
        'track-selected': track ? ui.trackSelected(track.title) : '',
        playing: track ? ui.nowPlaying(track.title) : '', paused: ui.paused,
        'mode-changed': ui.playbackModeChanged(ui.playbackModes[state.mode]),
        'playlist-ended': ui.playlistEnded, 'track-load-failed': track ? ui.trackLoadFailed(track.title) : '',
        'playback-failed': ui.playbackFailed, 'playlist-updated': state.tracks.length ? ui.playlistUpdated : ui.noTracks,
      }[notice];
      status.textContent = message;
    }
  };
  const session = createPlaybackSession({
    playlistUrl: new URL(player.dataset.playlistUrl!, window.location.href).href,
    defaultCover: musicConfig.defaultCover,
    defaultMode: player.dataset.playbackMode as PlaybackMode,
    base: import.meta.env.BASE_URL,
    onChange: render,
    audio: {
      get paused() { return audio.paused; }, get ended() { return audio.ended; },
      get hasError() { return audio.error !== null; }, get currentTime() { return audio.currentTime; }, get duration() { return audio.duration; },
      setSource(source) {
        if (source === null) { audio.removeAttribute('src'); audio.load(); }
        else audio.src = source;
      },
      play: () => audio.play(), pause: () => audio.pause(), seek: (seconds) => { audio.currentTime = seconds; }, reload: () => audio.load(),
      listen(listener) {
        const audioEvents = new AbortController();
        for (const event of playbackAudioEvents) audio.addEventListener(event, () => listener(event), { signal: audioEvents.signal });
        return () => audioEvents.abort();
      },
    },
  });
  const disposePlaylist = createPlaylistPanel(player, {
    openLabel: ui.openPlaylist, closeLabel: ui.closePlaylist, onSelect: (index) => session.select(index),
  });
  play.addEventListener('click', () => void session.togglePlayback(), { signal });
  previous.addEventListener('click', () => session.skip(-1), { signal });
  next.addEventListener('click', () => session.skip(1), { signal });
  seek.addEventListener('input', () => session.seek(Number(seek.value)), { signal });
  refresh.addEventListener('click', () => void session.refresh(), { signal });
  modeToggle.addEventListener('click', () => session.cycleMode(), { signal });
  render(session.getSnapshot());
  void session.refresh();
  return () => {
    disposePlaylist();
    events.abort();
    titleResizeObserver.disconnect();
    session.dispose();
  };
}

let active: { player: HTMLElement; dispose: () => void } | undefined;
function initializePlayer() {
  const player = document.querySelector<HTMLElement>('[data-music-player]');
  if (active?.player === player) return;
  active?.dispose();
  active = player ? { player, dispose: mountPlayer(player) } : undefined;
}
initializePlayer();
document.addEventListener('astro:page-load', initializePlayer);
