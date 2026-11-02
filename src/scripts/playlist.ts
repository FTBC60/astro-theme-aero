import type { MusicTrack } from '../config/music.config';

export type PlaylistTrack = MusicTrack & { cover: string };

/** Resolve local media from the playlist location, independent of the current page. */
export function parsePlaylist(value: unknown, playlistUrl: string, defaultCover: string, base: string): PlaylistTrack[] {
  const mediaUrl = (path: string) => {
    const source = path.trim();
    if (!source || source.startsWith('//') || source.includes('\\')) throw new Error('Invalid media path');
    if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
      const url = new URL(source);
      if (url.protocol !== 'https:') throw new Error('External media requires HTTPS');
      return url.href;
    }
    const url = new URL(source.startsWith('/') ? `${base.replace(/\/$/, '')}${source}` : source, playlistUrl);
    if (url.origin !== new URL(playlistUrl).origin) throw new Error('Invalid local media path');
    return url.href;
  };
  if (!Array.isArray(value)) throw new Error('Playlist must be an array');
  return value.map((track) => {
    if (!track || typeof track.title !== 'string' || !track.title.trim() ||
        typeof track.src !== 'string' ||
        (track.artist !== undefined && typeof track.artist !== 'string') ||
        (track.cover !== undefined && typeof track.cover !== 'string')) throw new Error('Invalid track');
    return {
      title: track.title.trim(),
      artist: track.artist,
      src: mediaUrl(track.src),
      cover: mediaUrl(track.cover?.trim() || defaultCover),
    };
  });
}
