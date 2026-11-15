---
status: accepted
---

# 0020：保留 Aero 外观，兼容 Windows 7 浏览器的单份静态构建

2026-11-14（America/Los_Angeles）。为使 Aero v1.2.0 在 Windows 7 的 Chrome 109、Firefox 115 ESR 及现代浏览器中使用同一份静态构建产物，采用现有颜色推导函数预计算配色、显式同步播放列表层级、简化不兼容 CSS 选择器的方案。本决策已在 `static` 工作区实施；作者确认已同步至 NAS、在 Cloudflare Worker 编译发布，并于 Windows 7 虚拟机测试未发现问题，准予验收。

## 背景

主题的动态配色、Aero 玻璃背景、按钮渐变、歌单窗口与跨页音乐播放器均需保留。兼容性审查确认，现有样式中的 10 处 `color-mix(in srgb, …)`、9 处生效的 `rgba(from …)`、两处以 `:has()` 控制的层级规则，以及 `:nth-child(1 of .widget)`，会影响目标旧版浏览器的颜色计算或布局。尤其是 Chrome 109 的混色与首个 Widget 选择器，以及 Firefox 115 ESR 的歌单层级选择器。

既有 `deriveThemeColors()` 已负责 HEX、HSL 与 RGB 推导，`playlist-panel.ts` 已负责歌单的展开、关闭动画和 Astro 跨页迁移。利用这两个入口即可解决兼容点，无需改变主题初始化、构建和播放器的整体架构。

## 决策

- 在 [`deriveThemeColors()`](../../src/scripts/theme-colors.ts) 内按不透明颜色的 sRGB 通道权重预计算 **10 个不同混合色 Token**，再输出 `--primary-rgb` 和 `--surface-rgb` 两个 RGB 通道 Token。最终混合通道只舍入一次；继续区分 CSS 纯白 `#ffffff` 与 Aero 表面白 `#f2f6f8`，保留既有 HSL/HEX 推导和动态切色逻辑。
- 在现有 [SCSS 样式](../../src/styles/_partial/_variables.scss)中使用普通 RGB/`rgba()` 和上述 Token，替换生效的 `color-mix()` 与相对颜色语法。首屏内联的 `deriveThemeColors.toString()`、运行时主题恢复与切色继续共用同一函数。
- 在[歌单浮层](../../src/scripts/playlist-panel.ts)中以 `panel.hidden` 推导 `playlist-layer-visible` class，分别应用到播放器及当前 `.sidebar-sticky-group`。`hidePanel()` 统一处理真正隐藏面板时的层级清理，`syncLayer()` 只持有当前处于提升状态的 Sticky 父容器引用，跨页时清理旧父容器。关闭的 220ms 动画期间保留层级，直至 `transitionend` 或原有 240ms 兜底完成；已展开歌单在 `astro:before-swap` 时保持展开状态，并于 `astro:page-load` 重新同步父容器。
- 将 `:has()` 改为显式层级 class，分别保留 Sticky 父容器与播放器原有的 `z-index: 5`；将 `.sidebar-sticky-group > :nth-child(1 of .widget)` 改为 `.sidebar-sticky-group > .widget:first-child`，符合当前侧栏子元素结构。

保留现有 `ClientRouter` 降级、Firefox 原生滚动条、Vite 构建目标和播放器持久化机制。不引入浏览器探测、Polyfill、第二套兼容样式、额外的层级状态或 DOM 观察器。

## 取舍与影响

预计算颜色使旧版和现代浏览器消费一致的 CSS 色值，代价是在现有颜色推导结果中增加 12 个 Token。10 个混色结果的颜色输入或比例各不相同，因此分别保留变量。测试需核对混色方向、舍入精度及默认色和自定义色的视觉一致性。

层级 class 由实际可见状态 `panel.hidden` 驱动，而交互展开状态仍由 `isOpen` 决定。关闭动画期间两者有意不同，避免窗口尚在收起时提前降低层级；一个旧父容器引用足以完成跨页清理，沿用现有事件与定时器。

## 落地与验收

改动集中在 `src/scripts/theme-colors.ts`、`src/scripts/playlist-panel.ts` 和五个既有 SCSS 文件（`_variables.scss`、`_main.scss`、`_widgets/_music.scss`、`_widgets/_profile.scss`、`_widgets/_theme.scss`），并补充颜色推导和歌单生命周期回归测试。

2026-11-14 的本地实施记录显示，颜色测试 2 项、播放列表测试 69 项、发行包测试 155 项全部通过；`npm run check` 检查 89 个文件且零错误、警告和提示；`npm run build` 生成 8 个静态页面。构建 CSS 扫描未发现上述不兼容语法的有效使用，`git diff --check` 通过。自动化检查运行于 Windows 10、Node.js 22.18.0。

作者随后确认已同步到 NAS、在 Cloudflare Worker 编译发布，并在 Windows 7 虚拟机中测试未发现问题，**接受本次兼容改造**。这份验收反馈针对 Windows 7 虚拟机的总体表现，未提供 Chrome 109 与 Firefox 115 ESR 各自的逐项测量记录。开发仓库的兼容改动已提交为 `e3eb586`。

## 依据

讨论、实施与作者验收反馈见 [S21](SOURCES.md#s21)，变更追溯见 [HISTORY.md](HISTORY.md)。功能影响、Token 明细、层级生命周期、源码清单及验收项目见 [Aero Windows 7 浏览器兼容改造方案](../architecture/aero-windows-7-compatibility-plan.md)。
