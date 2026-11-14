---
status: accepted
---

# 0018：Windows 7 Aero 播放列表的向下手风琴与可视高度约束

2026-11-13（America/Los_Angeles）。在 [ADR-0006](0006-runtime-static-playlist.md) 的静态歌单和 [ADR-0017](0017-blob-playback-and-media-session.md) 的播放会话基础上，采用 Windows 7 Aero 风格的独立歌单窗口，并修复其在矮视口中的越界及减少动画偏好失效问题。本决策已经合并至 `static`，对应提交 `7ebb573`。

## 背景

Gemini 提供的方案使用 7.css 风格窗口、始终向下展开的 CSS Grid 手风琴，以及仅在歌曲列表内滚动的布局。作者曾将该原始版本在 NAS 上成功构建并发布。随后在 1280×560 的桌面视口复现窗口底部越界，原因之一是定位计算使用 `Math.max(132, below)` 强制至少 132px 高；另发现 `prefers-reduced-motion: reduce` 规则被后续同优先级过渡声明覆盖。

讨论先后评估了自动滚动页面或侧栏、极矮空间的紧凑模式、整个窗口滚动，以及用 CSS `visibility` 取代 `hidden`。最终取舍遵循低维护成本原则，保留实际可用的窗口交互，只修复已确认的缺陷与确实冗余的监听机制。详细设计、实施过程与检查记录见[最终开发方案 v2.2](../architecture/playlist-aero-final-development-plan.md)。

## 决策

### 展开、窗口布局与滚动

- 播放列表始终从播放器下方向下展开，保留 Windows 7 Aero 窗口外观、Grid `0fr ↔ 1fr` 的 220ms 展开/收起动画，以及 180ms 透明度过渡。
- 标题栏、关闭按钮、刷新与播放模式操作区保持固定。只有 `.playlist-items` 使用 `overflow-y: auto` 独立滚动，`.playlist-window-body` 负责剩余高度分配和裁切；保留歌曲区正常情况下 `min(45vh, 220px)` 的上限。
- 允许极矮视口或锚点接近底边时歌曲列表暂时不可见。不引入整窗滚动、运行时 `data-compact` 切换、应用层自动滚动及其完成协调机制。

### 真实下方空间和完整外框预算

[定位模块](../../src/scripts/playlist-position.ts) 以播放器和控制区较低的底边为锚点，向下预留 8px。可用下边界取视觉视口及具有纵向裁剪/滚动能力的祖先边界的交集，并保留 12px 安全间距。对 `bottom - panelTop` 取非负值后，分别设置：

- `--playlist-outer-max-height` 限制包含外层留白的手风琴容器。
- `--playlist-max-height` 限制窗口本体，仅扣除 `.playlist-accordion-inner` 位于窗口盒外的上下 padding。

窗口采用 `box-sizing: border-box`，边框、内部 padding 和标题栏已经包含在窗口的高度上限中。移除 132px 强制下限，剩余空间为零时允许外层高度为零，避免外层留白单独造成溢出。窗口和祖先几何尺寸改变时继续依赖现有的滚动、窗口/视觉视口 resize 与 `ResizeObserver` 重新定位。

### 展开状态、可访问性与动画收尾

[浮层模块](../../src/scripts/playlist-panel.ts) 保留 `isOpen` 为唯一的 JavaScript 开关决策状态。由 `setOpen()` 同步播放器的 `playlist-open` 类、按钮 `aria-expanded` 与文案、面板 `inert`、定位及触摸监听。展开时先解除 `hidden`，关闭时立即设置 `inert` 并收起动画。

保留 `hidden`、面板局部 `transitionend` 与 240ms 兜底计时器：现有 Sticky 侧栏和播放器层级规则依赖 `.playlist-accordion:not([hidden])`，使关闭动画期间窗口保持正确叠放。快速重新展开取消旧计时器；减少动画模式、立即释放或节点断开时同步 `hidden`。把减少动画规则放在普通过渡样式之后，覆盖手风琴的过渡。

### 精简与模块边界

删除定位模块的 `MutationObserver`、document 级 `transitionend` 和失去用途的 `data-placement="below"`。定位不依赖歌曲条目的自然高度，歌曲变化由现有 Flex 布局与独立滚动容器处理。保留 `ResizeObserver` 与面板局部的动画完成事件，各自承担实际职责。

选择性整合 Gemini 的歌单外观、定位和触摸变更，保留 Static 现有播放会话、歌单读取、选曲和 Astro 跨页持续播放契约。调色板保留独立的展开逻辑，不增加通用手风琴管理器。

## 影响与取舍

日常使用时，用户可以滚动长歌曲列表而持续看到窗口标题和操作按钮。对于下方可用高度小于固定控制区的场景，列表可能完全被裁切；页面或侧栏由用户自行滚动，定位监听随后更新尺寸。这是始终向下展开、固定控制区与不主动移动用户视口三项交互约束下接受的边界。

`hidden` 的动画收尾保留了一处局部监听与兜底计时器，也保留了原有层级时序。删除它需要同步重新设计并验证收起期间的 Sticky 层级，当前没有足够的简化收益。

## 落地与验证

实现见 `7ebb573`（`feat: integrate Aero playlist with viewport-safe accordion`），涉及 [MusicWidget](../../src/components/MusicWidget.astro)、[定位模块](../../src/scripts/playlist-position.ts)、[浮层模块](../../src/scripts/playlist-panel.ts)、[触摸模块](../../src/scripts/playlist-touch.ts)、[音乐样式](../../src/styles/_partial/_widgets/_music.scss)和相关回归测试。

2026-11-13 合并前的本地记录显示 `npm run check` 为零错误、警告和提示，`npm run test:playlist` 的 67 项测试全部通过，`npm run build` 生成 8 个静态页面。Chrome 1280×560 下外框从 462px 至 548px，距视口底边 12px；1280×720 下标题栏与操作区保持固定，歌曲区独立滚动。另检查等效 125%/150% 缩放视口、390×844 移动端仿真、20 首歌曲滚动、减少动画、快速开关及 Astro 站内导航。

本轮完整 `test:release` 曾因执行挂起而停止。上述移动端验证来自 Chrome 设备仿真；物理手机触摸体验以及最终合并版本的 NAS 构建和线上发布仍待按发布流程核验。原始 Gemini 版的 NAS 成功发布记录与最终修复版的验收范围分别记录。

## 依据

决策来自 2026-11-13 关于 v1 至 v2.2 的方案讨论，以及 `7ebb573` 的实际实现和回归记录。模块接口及导航行为见[歌单浮层与播放器接入](../architecture/playlist-panel.md)，讨论与测试记录见[最终开发方案 v2.2](../architecture/playlist-aero-final-development-plan.md)。来源索引见 [S19](SOURCES.md#s19)。
