export interface MusicTrack {
  /** Title shown in the player and playlist. */
  title: string;
  /** Optional artist shown in the playlist and title tooltip. */
  artist?: string;
  /** public/ resource path (e.g. /audio/song.mp3) or an HTTPS audio URL. */
  src: string;
  /** Optional cover; falls back to defaultCover. */
  cover?: string;
}

export const playbackModes = ['sequential', 'list-loop', 'single-loop'] as const;
export type PlaybackMode = (typeof playbackModes)[number];

export interface MusicConfig {
  /** false removes the player; an empty playlist keeps its disabled shell. */
  enabled: boolean;
  /** Cover shown when a track does not provide its own. */
  defaultCover: string;
  /** Sequential stops after the last track; the two loop modes repeat the list or current track. */
  defaultPlaybackMode: PlaybackMode;
}

export const musicConfig: MusicConfig = {
  enabled: true,
  defaultCover: '/image/music-cover.svg',
  defaultPlaybackMode: 'list-loop',
};
