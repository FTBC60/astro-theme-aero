import type { ThemeId } from '../config/theme.config';
import type { PlaybackMode } from '../config/music.config';

export type Locale = 'zh-CN' | 'en';

interface UiMessages {
  navigation: string;
  home: string;
  archives: string;
  about: string;
  sidebar: string;
  profile: string;
  openSidebar: string;
  closeSidebar: string;
  backHome: string;
  visitAuthor: (author: string) => string;
  authorAvatar: (author: string) => string;
  tags: string;
  postList: string;
  readPost: (title: string) => string;
  readMore: string;
  pagination: string;
  previousPage: string;
  nextPage: string;
  pageNumber: (page: number) => string;
  pageTitle: (page: number) => string;
  postListPage: (page: number) => string;
  postArchive: string;
  updated: string;
  poweredBy: string;
  themeTitle: string;
  chooseTheme: string;
  defaultTheme: string;
  themeLabels: Record<ThemeId, string>;
  themeRestored: (label: string) => string;
  themeChanged: (label: string) => string;
  musicPlayer: string;
  noTracks: string;
  musicTitle: string;
  seek: string;
  play: string;
  playNoTracks: string;
  pause: string;
  previousTrack: string;
  nextTrack: string;
  openPlaylist: string;
  closePlaylist: string;
  playlist: string;
  playlistLoading: string;
  refreshPlaylist: string;
  retryPlaylist: string;
  playlistLoadFailed: string;
  playlistRefreshFailed: string;
  playlistUpdated: string;
  emptyPlaylist: string;
  startListening: string;
  playbackModes: Record<PlaybackMode, string>;
  playbackModeButton: (current: string, next: string) => string;
  playbackModeChanged: (mode: string) => string;
  nowPlaying: (title: string) => string;
  playbackFailed: string;
  trackSelected: (title: string) => string;
  paused: string;
  playlistEnded: string;
  trackLoadFailed: (title: string) => string;
}

export const translations: Record<Locale, UiMessages> = {
  'zh-CN': {
    navigation: '主导航', home: '首页', archives: '归档', about: '关于',
    sidebar: '个人资料与小组件', profile: '个人资料', openSidebar: '展开侧栏', closeSidebar: '收起侧栏',
    backHome: '返回首页', visitAuthor: (author) => `访问${author}的链接`, authorAvatar: (author) => `${author} 的头像`,
    tags: '标签', postList: '文章列表', readPost: (title) => `阅读 ${title}`, readMore: '阅读全文',
    pagination: '分页', previousPage: '上一页', nextPage: '下一页',
    pageNumber: (page) => `第 ${page} 页`, pageTitle: (page) => `第 ${page} 页`, postListPage: (page) => `文章列表 · 第 ${page} 页`,
    postArchive: '文章归档', updated: '更新于', poweredBy: '由 Astro 驱动',
    themeTitle: 'Aero 配色', chooseTheme: '选择 Aero 配色', defaultTheme: '默认',
    themeLabels: { 'classic-blue': '经典蓝', 'emerald-green': '翡翠绿', violet: '紫罗兰' },
    themeRestored: (label) => `已恢复站点默认配色：${label}`, themeChanged: (label) => `已切换为${label}`,
    musicPlayer: '音乐播放器', noTracks: '未配置歌曲', musicTitle: '音乐', seek: '播放进度',
    play: '播放', playNoTracks: '播放（未配置歌曲）', pause: '暂停',
    previousTrack: '上一首', nextTrack: '下一首', openPlaylist: '展开播放列表', closePlaylist: '收起播放列表',
    playlist: '播放列表', emptyPlaylist: '暂无歌曲', startListening: '点击播放开始收听',
    playlistLoading: '正在加载歌单…', refreshPlaylist: '刷新歌单', retryPlaylist: '重试',
    playlistLoadFailed: '歌单加载失败，请重试。', playlistRefreshFailed: '刷新失败，已保留原歌单。', playlistUpdated: '歌单已更新',
    playbackModes: { sequential: '顺序播放', 'list-loop': '列表循环', 'single-loop': '单曲循环' },
    playbackModeButton: (current, next) => `播放模式：${current}；点击切换为${next}`,
    playbackModeChanged: (mode) => `播放模式：${mode}`,
    nowPlaying: (title) => `正在播放：${title}`,
    playbackFailed: '无法播放，请检查音频地址或再次点击播放。',
    trackSelected: (title) => `已选择：${title}`, paused: '已暂停', playlistEnded: '播放列表已结束',
    trackLoadFailed: (title) => `无法加载：${title}。请检查音频地址，或切换到其他曲目。`,
  },
  en: {
    navigation: 'Main navigation', home: 'Home', archives: 'Archives', about: 'About',
    sidebar: 'Profile and widgets', profile: 'Profile', openSidebar: 'Open sidebar', closeSidebar: 'Close sidebar',
    backHome: 'Back to home', visitAuthor: (author) => `Visit ${author}'s link`, authorAvatar: (author) => `${author}'s avatar`,
    tags: 'Tags', postList: 'Posts', readPost: (title) => `Read ${title}`, readMore: 'Read More...',
    pagination: 'Pagination', previousPage: 'Previous page', nextPage: 'Next page',
    pageNumber: (page) => `Page ${page}`, pageTitle: (page) => `Page ${page}`, postListPage: (page) => `Posts · Page ${page}`,
    postArchive: 'Post archive', updated: 'Updated', poweredBy: 'Powered by Astro',
    themeTitle: 'Aero Colors', chooseTheme: 'Choose an Aero color', defaultTheme: 'Default',
    themeLabels: { 'classic-blue': 'Classic Blue', 'emerald-green': 'Emerald Green', violet: 'Violet' },
    themeRestored: (label) => `Restored site default color: ${label}`, themeChanged: (label) => `Switched to ${label}`,
    musicPlayer: 'Music player', noTracks: 'No tracks configured', musicTitle: 'Music', seek: 'Playback progress',
    play: 'Play', playNoTracks: 'Play (no tracks configured)', pause: 'Pause',
    previousTrack: 'Previous track', nextTrack: 'Next track', openPlaylist: 'Open playlist', closePlaylist: 'Close playlist',
    playlist: 'Playlist', emptyPlaylist: 'No tracks yet', startListening: 'Press play to start listening',
    playlistLoading: 'Loading playlist…', refreshPlaylist: 'Refresh playlist', retryPlaylist: 'Retry',
    playlistLoadFailed: 'Unable to load playlist. Please retry.', playlistRefreshFailed: 'Refresh failed. Previous playlist retained.', playlistUpdated: 'Playlist updated',
    playbackModes: { sequential: 'Play in order', 'list-loop': 'Loop playlist', 'single-loop': 'Repeat one' },
    playbackModeButton: (current, next) => `Playback mode: ${current}; activate to switch to ${next}`,
    playbackModeChanged: (mode) => `Playback mode: ${mode}`,
    nowPlaying: (title) => `Now playing: ${title}`,
    playbackFailed: 'Unable to play. Check the audio URL or press play again.',
    trackSelected: (title) => `Selected: ${title}`, paused: 'Paused', playlistEnded: 'Playlist finished',
    trackLoadFailed: (title) => `Unable to load ${title}. Check the audio URL or choose another track.`,
  },
};

export function getUi(locale: Locale): UiMessages {
  return translations[locale];
}
