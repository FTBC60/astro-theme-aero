# Aero v1.2.0 · Windows 7 浏览器兼容改造方案（最终版）

> 日期：2026-11-14（America/Los_Angeles）
> 状态：已实施，自动化检查通过；作者确认 Windows 7 虚拟机验收通过
> 目标仓库：`astro-theme-aero-static`
> 目标浏览器：Windows 7 上的 Chrome 109、Firefox 115 ESR 及现代浏览器

## 1. 目标与现有依据

让单份 Astro 构建产物在目标浏览器中保持当前 Aero 玻璃背景、动态主题色、渐变、音乐播放器、歌单动画和站内导航的主要视觉效果与交互行为。

当前源码中影响上述目标的兼容点集中在以下几处。

| 优先级 | 源码现状 | 影响 | 处理方式 |
| --- | --- | --- | --- |
| P0 | 10 处 `color-mix(in srgb, …)` | Chrome 109 无法计算相关渐变、阴影及选中/悬停色 | 由现有主题颜色推导函数生成普通 RGB 值 |
| P0 | 9 处生效的 `rgba(from …)` | 两款目标浏览器无法正确使用相关背景与阴影 | 换成 RGB 通道变量或普通 `rgba()` |
| P1 | 2 处 `:has()` 层级规则 | Firefox 115 无法提升歌单与 Sticky 父容器层级 | 复用面板生命周期管理显式 class |
| P2 | `:nth-child(1 of .widget)` | Chrome 109 不支持该形式 | 使用 `.widget:first-child` |

`_main.scss` 中另有一处被注释掉的 `rgba(from …)` 示例，它不是生效样式。正式构建产物中应没有上述不兼容语法的有效声明。

## 2. P0 · 保持现有配色的兼容计算

### 2.1 颜色生成位置与精度

扩展 `src/scripts/theme-colors.ts` 内现有的 `deriveThemeColors(hex, surface)`，继续保留 HEX/HSL 主色推导、可读文本颜色、`normalizeThemeColor()` 与 `applyThemeColors()` 的原有流程。

只在 `deriveThemeColors()` 内部增加简单的 sRGB 混色辅助函数。所有现有混色输入都是不透明颜色，混色权重表示**第二种颜色**的比例。

```ts
function mix(first: number[], second: number[], weight: number): number[] {
  return first.map((channel, index) =>
    Math.round(channel * (1 - weight) + second[index] * weight)
  );
}
```

在混合通道时保留浮点计算，每个最终混合通道只舍入一次。现有 `rgbFromHsl()` 本身输出整数 RGB，维持该既有行为；与浏览器计算结果比较时检查由 HSL 转换和舍入产生的细微误差。`white` 始终按 `#ffffff` 计算，`black` 按 `#000000` 计算。**CSS 的 `white` 与 Aero 表面色 `--white-main: #f2f6f8` 不可混用。**

### 2.2 最终颜色 Token

新增 **2 个 RGB 通道变量和 10 个混合色变量**。已核对 10 处 `color-mix()` 的颜色输入或权重各不相同，当前没有可去重的相同混色结果。

| 新增 Token | 对应原始颜色计算 |
| --- | --- |
| `--primary-rgb` | 主色 RGB 通道，逗号分隔，供 `rgba(var(--primary-rgb), alpha)` 使用 |
| `--surface-rgb` | `surface` / `--white-main` 的 RGB 通道，供透明表面高光使用 |
| `--aero-grad-light` | secondary 与 `white 60%` |
| `--aero-grad-dark` | secondary 与 `black 10%` |
| `--highlight-hover-dark` | highlight 与 `black 10%` |
| `--music-glow-color` | primary 与 `white 50%` |
| `--playlist-selected-border` | primary 与 `#7da2ce 45%` |
| `--playlist-selected-start` | highlight 与 `white 70%` |
| `--playlist-selected-end` | primary 与 `white 75%` |
| `--playlist-hover-border` | primary 与 `white 30%` |
| `--playlist-hover-start` | highlight 与 `white 82%` |
| `--playlist-hover-end` | primary 与 `white 84%` |

原有 `--primary-color`、`--highlight-color`、`--secondary-color` 等 Token 继续作为正常颜色值提供。SCSS 的渐变定义只需消费预计算色标，保留原有停靠百分比，例如：

```scss
--aero-grad: linear-gradient(
  to bottom,
  var(--aero-grad-light) 0%,
  var(--secondary-color) 50%,
  var(--aero-grad-dark) 51%,
  var(--secondary-color) 100%
);
```

### 2.3 动态透明色对应关系

| 文件 | 现有用途 | 兼容表达式 |
| --- | --- | --- |
| `_main.scss` | `.card` 背景、内部光晕 | `rgba(var(--primary-rgb), var(--glass-opacity))` 与 `rgba(var(--primary-rgb), var(--glass-glow-opacity))` |
| `_variables.scss` | `--shadow-raised` | `rgba(0, 0, 0, var(--shadow-opacity))` |
| `_widgets/_music.scss` | 固定黑色投影、播放器 `::before` 的表面高光和黑色渐变、歌单背景 | 分别使用普通黑色 `rgba()`、`rgba(var(--surface-rgb), 0.8)` 和 `rgba(var(--primary-rgb), 0.56)` |
| `_widgets/_theme.scss` | Aero 窗口背景 | `rgba(var(--primary-rgb), 0.42)` |
| `_widgets/_profile.scss` | 固定黑色投影 | `rgba(0, 0, 0, 0.6)` |

`_widgets/_music.scss` 中 `::before` 渐变的黑色端点继续使用 `rgba(0, 0, 0, 0.1)`。清除 `--aero-grad`、`--shadow-raised` 等自定义属性内部的不兼容表达式，避免在消费 `var()` 时整条声明失效。

### 2.4 首屏与切色必须使用同一结果

`src/layouts/BaseLayout.astro` 先调用 `deriveThemeColors(defaultColor)` 写出默认 Token，再通过首屏内联脚本恢复本地保存的颜色。该内联脚本使用 `deriveThemeColors.toString()`，因此新增混色辅助函数必须定义在 `deriveThemeColors()` 内部，确保内联时不存在外部函数依赖。

`src/scripts/theme.ts` 的运行时切色和 `astro:before-swap` 继续使用现有 `deriveThemeColors()` / `applyThemeColors()` 调用链。默认色、已保存自定义色、手动切色及导航后的颜色输出应一致，不另设兼容初始化入口。

## 3. P1 · 歌单及 Sticky 层级生命周期

### 3.1 沿用原有 CSS 层级值

源码已确认 `src/styles/_partial/_main.scss` 的 Sticky 父容器为 `position: sticky; z-index: 5`（层级在 `:has()` 规则中生效），`src/styles/_partial/_widgets/_music.scss` 的播放器为 `position: relative; z-index: 5`（同样由原先含 `:has()` 的规则生效）。替换选择器时，各自仍保留原值 `5`。

```scss
// _main.scss
.sidebar-sticky-group.playlist-layer-visible {
  z-index: 5;
}

// _widgets/_music.scss
.music-widget.playlist-layer-visible {
  z-index: 5;
}
```

### 3.2 用真实可见状态同步层级

在 `src/scripts/playlist-panel.ts` 内使用现有 `panel.hidden` 派生层级 class。`isOpen` 仍决定交互是否展开；关闭动画开始时 `isOpen` 为 `false`，但 `panel.hidden` 暂时保持 `false`，确保层级一直提升到动画结束。

只保留一个指向**当前已提升层级的 Sticky 父容器**的引用，隐藏后置回 `null`：

```ts
const layerClass = 'playlist-layer-visible';
let previousStickyParent: HTMLElement | null = null;

function syncLayer() {
  const visible = !panel.hidden;
  const currentParent = visible
    ? player.closest<HTMLElement>('.sidebar-sticky-group')
    : null;

  if (previousStickyParent !== currentParent) {
    previousStickyParent?.classList.remove(layerClass);
  }

  player.classList.toggle(layerClass, visible);
  currentParent?.classList.add(layerClass);
  previousStickyParent = currentParent;
}

function hidePanel() {
  panel.hidden = true;
  syncLayer();
}
```

打开时在 `panel.hidden = false` 后立即执行 `syncLayer()`，再按原有逻辑驱动动画与 `playlist-open`。关闭时立刻移除 `playlist-open` 启动收起动画，保留层级 class，直至真正调用 `hidePanel()`。

| 阶段 | `isOpen` | `panel.hidden` | 层级 class |
| --- | --- | --- | --- |
| 初始关闭 | `false` | `true` | 无 |
| 展开完成 | `true` | `false` | 有 |
| 收起动画中 | `false` | `false` | 有 |
| 收起完成 | `false` | `true` | 无 |

将现有所有 `panel.hidden = true` 的路径集中替换为 `hidePanel()`，包括立即关闭、局部 `transitionend`、240ms 兜底定时器、`astro:before-swap` 里已关闭歌单的收尾，以及播放器销毁；原有定时器取消、ARIA、`inert`、焦点和触摸观察行为保持一致。

### 3.3 Astro 跨页迁移

`src/components/MusicWidget.astro` 使用 `transition:persist`，`src/scripts/music.ts` 按播放器 DOM 身份复用实例。跨页后同一个播放器可能归属于新的 `.sidebar-sticky-group`。

- `astro:before-swap` 遇到**已展开**歌单时保留原展开状态，仅执行现有暂停观察操作，不调用 `hidePanel()`。
- `astro:before-swap` 遇到**正在关闭**的歌单时，按原逻辑取消关闭计时并调用 `hidePanel()`。
- `astro:page-load` 在播放器仍连接时调用 `syncLayer()`，清除旧父容器 class 并为新父容器同步 class，随后恢复原有定位和触摸观察。
- 销毁播放器时立即关闭并通过 `hidePanel()` 清除播放器、最后一个父容器的 class。

复用现有生命周期，不增加额外计时器、布尔状态、DOM 观察器或全局层级管理器。

## 4. P2 · 兼容侧栏首个 Widget 选择器

在 `src/styles/_partial/_main.scss` 将：

```scss
.sidebar-sticky-group > :nth-child(1 of .widget) {
  margin-top: 0;
}
```

替换为：

```scss
.sidebar-sticky-group > .widget:first-child {
  margin-top: 0;
}
```

`src/components/Sidebar.astro` 中 Sticky 容器的直接子元素依次为可选音乐组件、可选标签组件、主题切换器。三者根节点都使用 `.widget` 类，现有结构满足上述简化选择器的语义。

## 5. 变更清单与实施顺序

预计修改以下 **7 个源码文件**。

| 文件 | 计划变更 |
| --- | --- |
| `src/scripts/theme-colors.ts` | 计算 12 个兼容 Token，新增内联安全的简单 sRGB 混色函数 |
| `src/styles/_partial/_variables.scss` | 替换阴影与 Aero 渐变的兼容表达式 |
| `src/styles/_partial/_main.scss` | 修复卡片背景/光晕、按钮混色、Sticky 层级与首个 Widget 选择器 |
| `src/styles/_partial/_widgets/_music.scss` | 修复播放器阴影、面板背景、选中/悬停色及层级规则 |
| `src/styles/_partial/_widgets/_theme.scss` | 替换 Aero 窗口相对颜色 |
| `src/styles/_partial/_widgets/_profile.scss` | 替换头像固定黑色阴影 |
| `src/scripts/playlist-panel.ts` | 新增 `syncLayer()` / `hidePanel()`，覆盖动画与导航清理 |

实施顺序按颜色函数 → 相关 SCSS → 层级生命周期 → 旧选择器 → 回归与实机验收推进。自动化测试按需要补充到既有 `tools/test/`，不计入上述源码文件数。

保留 `BaseLayout.astro`、`theme.ts` 的初始化架构、`<ClientRouter fallback="animate" />`、现有 `scrollend` 回退及当前 Vite 构建配置。Firefox 115 使用原生滚动条；本轮不增加第二套 CSS、User-Agent 分流、Polyfill 或独立旧浏览器构建流程。

## 6. 验收标准

### 6.1 颜色正确性

使用默认 Aero 蓝色、一种明显不同色相的 HEX 色、灰阶色、接近黑色和白色的 HEX 色，检查主色及原有 Token 保持预期，所有 10 个混合结果与现代浏览器 `color-mix(in srgb, …)` 的计算结果一致或仅存在整数通道舍入误差。特别核验混色权重方向、HSL 转换、`white` 和 `--white-main` 的区别，以及初始 HTML Token 与首屏、运行时切色的结果一致。

可在现有 Node `node:test` 体系中补充颜色推导测试，不新增测试框架。

### 6.2 播放列表与 CSS

覆盖初始关闭、展开、220ms 收起动画、240ms 超时收尾、快速关闭后重开、减少动画、立即关闭、销毁，以及跨页持久化播放器迁移。检查旧 Sticky 父容器不遗留层级 class，展开状态能延续到新页面，原有 `inert`、ARIA、键盘和点击行为正常。

检查构建 CSS 中不再包含会生效的 `rgba(from …)`、`color-mix()`、`:has()` 或 `:nth-child(1 of …)`，并确认渐变、阴影声明可在目标浏览器中成功计算。

在开发仓库内运行：

```powershell
npm run check
npm run test:playlist
npm run build
```

### 6.3 Windows 7 实机验收

在 **Chrome 109** 和 **Firefox 115 ESR** 分别使用构建产物检查默认色与保存色首屏、玻璃模糊和透明背景、按钮渐变、歌单选中及悬停、展开/收起与页脚遮挡、调色板保存/恢复、音乐播放跨页持续、历史导航和键盘操作。主要视觉与功能保持一致即可，细微滚动条和渲染像素差异按实机表现判断。

## 7. 实施与验证记录

2026-11-14 已按本方案完成第 5 节列出的七个源码文件修改。`deriveThemeColors()` 在现有流程内输出 12 个兼容 Token，SCSS 统一消费预计算色值；播放列表通过 `panel.hidden` 同步播放器和 Sticky 父容器层级，关闭和跨页迁移均清理旧 class。补充 `tools/test/theme-colors.test.mjs` 以及现有歌单测试的层级断言，并在测试 DOM 中模拟 Sticky 父容器。

| 验证项目 | 结果 |
| --- | --- |
| `node --test tools/test/theme-colors.test.mjs` | 2 项通过；覆盖 5 组代表性颜色、10 种混色及首屏内联函数一致性 |
| `npm run test:playlist` | 69 项通过；覆盖关闭动画、240ms 兜底、快速重开、跨页迁移和销毁 |
| `npm run check` | 89 个文件，0 errors、0 warnings、0 hints |
| `npm run build` | 构建成功，生成 8 个静态页面 |
| `npm run test:release` | 155 项通过，0 失败 |
| 构建 CSS 与源码样式扫描 | 无有效 `color-mix()`、`rgba(from …)`、`:has()`、`:nth-child(1 of …)` |
| `dist/index.html` 首屏颜色 | 已输出 `--primary-rgb`、`--surface-rgb` 及新增混色 Token |
| `git diff --check` | 通过 |

自动化验证在 Windows 10 的 Node.js 22.18.0 环境完成。2026-11-14，作者确认已同步 NAS、在 Cloudflare Worker 编译发布，并在 Windows 7 虚拟机中测试未发现问题，准予验收。该反馈记录的是 Windows 7 环境总体结果，未列出 Chrome 109 与 Firefox 115 ESR 各自的逐项数据。对应决策见 [ADR-0020](../adr/0020-windows-7-browser-compatibility.md)。
