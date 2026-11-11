---
status: accepted
---

# 0006：运行时读取静态歌单并保留跨页音频实例

曲目经常变化，而播放器开关、默认封面和播放模式属于主题设置。2026-10-24 讨论决定在纯静态分支继续分离这两类数据：浏览器读取静态 JSON 即可更新歌单，无须重新引入 SSR＋R2；随后按用户建议将歌单放到 `public/audio/playlist.json`。

`f4ceab0` 将曲目从 `music.config.ts` 移出，由 [music.ts](../../src/scripts/music.ts) 请求歌单，提供首次加载、手动刷新、失败重试和空列表状态；[playlist.ts](../../src/scripts/playlist.ts)相对于歌单位置解析媒体 URL，并兼容部署 base。[MusicWidget](../../src/components/MusicWidget.astro) 使用 Astro 持久化节点保留音频实例。刷新后当前音频地址仍存在时保留进度与播放状态；移除当前歌曲或清空列表时停止；请求或数据校验失败时保留最后可用列表。没有周期轮询。

相比构建时把曲目写进 HTML，这增加了运行时请求和失败处理，却允许歌单作为独立静态资源被读取。编辑本地 JSON 或替换音频后仍须部署新的 Assets；现有发布流程执行全站构建部署，没有额外的歌单专用发布工具。跨页续播不等于整页刷新后自动恢复或自动播放。后续浮层和触摸修复见[变更追溯表](HISTORY.md)。

依据：[S10](SOURCES.md#s10) L101/L113/L130 静态歌单取舍；[S11](SOURCES.md#s11) L271 实现授权、L678 歌单目录建议、L729 用户测试通过；提交 `f4ceab0`。此实现区别于历史 `dev` 的 `src/config/playlist.json`＋R2 发布方式。

2026-10-31 实现改进：[播放会话与 DOM 接入](../architecture/playback-session.md) 将歌单、音频状态、播放模式与异步结果集中到独立会话模块；DOM 层负责展示和事件转发，现有静态资源、手动刷新、跨页续播和播放规则继续遵守本决策。

2026-10-31 浮层接入改进：[歌单浮层与播放器接入](../architecture/playlist-panel.md) 集中开关、ARIA、焦点、定位与触摸协作，并统一导航重接入和释放。播放会话继续独立；保留移动侧栏与歌单共同处理 Escape 的既有行为。

2026-11-11 音频加载与系统控制扩展见 [ADR-0017](0017-blob-playback-and-media-session.md)。完整 Blob 与单首预取解决本轮静态部署中的定位和后台衔接问题，手动选曲立即执行，网页与 Media Session 共用现有播放会话。
