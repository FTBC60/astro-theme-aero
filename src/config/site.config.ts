import type { Locale } from '../i18n/ui';

interface NavigationItem {
  label: string | Record<Locale, string>;
  href?: string;
  icon: string;
}

interface SiteConfig {
  title: string;
  subtitle: string;
  author: string;
  lang: Locale;
  signature: string[];
  avatar: string;
  avatarLink: string;
  favicon: string;
  postsPerPage: number;
  navigation: NavigationItem[];
}

export const siteConfig: SiteConfig = {
  title: 'Aero Blog',
  subtitle: 'Hello, World!',
  author: 'Author',
  lang: 'zh-CN',
  signature: ['A place for notes and stories.'],
  avatar: '/image/avatar.jpg',
  avatarLink: '/about/',
  favicon: '/image/icon/vista_pc_1.jpg',
  postsPerPage: 10,
  navigation: [
    { label: { 'zh-CN': '首页', en: 'Home' }, href: '/', icon: '/image/icon/vista_messenger.jpg' },
    { label: { 'zh-CN': '归档', en: 'Archives' }, href: '/archives/', icon: '/image/icon/vista_book_1.jpg' },
    { label: { 'zh-CN': '关于', en: 'About' }, href: '/about/', icon: '/image/icon/vista_pc_1.jpg' },
  ],
};
