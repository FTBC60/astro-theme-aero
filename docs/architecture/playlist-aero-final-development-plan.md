# Windows Aero 播放列表修复与 Static 合并开发方案（最终版 v2.2）

> 日期：2026-11-13（America/Los_Angeles）
> 状态：已在 `feature/playlist-aero-v2.2` 实施，完成本地浏览器与自动化验收
> 目标仓库：`astro-theme-aero-static`，目标分支：`static`
> 关联：[歌单浮层与播放器接入](playlist-panel.md)、[播放会话与 DOM 接入](playback-session.md)

## 1. 背景、基线和目标

Gemini 将播放器歌单改成 Windows 7 Aero 窗口，采用始终向下展开的 CSS Grid 手风琴；标题栏、关闭按钮、刷新和播放模式控制保持固定，仅歌曲列表独立滚动。该版本已在 NAS 构建并发布。

前期审查确定两项缺陷：

1. `playlist-position.ts` 使用 `Math.max(132, below)` 强制至少 132px 高，1280×560 视口下曾复现窗口底部约到 598px 的越界。
2. `prefers-reduced-motion: reduce` 规则写在手风琴基础过渡声明之前，被后面的相同优先级声明覆盖，导致系统减少动画偏好无效。

本轮目标是修复上述两项缺陷，完整处理窗口外框的高度预算，删除有明确证据支持的冗余代码，再经浏览器验证考虑合并 `static`。保持既有播放器会话、歌单加载、选曲和 Astro 跨页行为。

### 1.1 实际源码状态

- `astro-theme-aero-static` 当前 `static` 分支仍使用旧的 `.playlist-panel` 和可向上/向下择位的定位逻辑。
- Gemini 审查副本及原始归档保存在工作区的非公开资料目录，供本地对照使用。
- 两份目录的差异涉及歌单组件、脚本、样式，也包含调色板文件与生成页面文件。**实施时应在 Static 的隔离工作分支选择性迁入歌单更改，不能整目录覆盖。**

## 2. 最终设计决策

| 项目 | 决定 | 依据 |
| --- | --- | --- |
| 展开方向 | 始终向下 | 既定交互，不再上下翻转 |
| 外观和动画 | 保留 7.css Aero、Grid `0fr ↔ 1fr`、220ms 高度过渡和原有透明度过渡 | 已发布的视觉基线 |
| 滚动区域 | **仅 `.playlist-items` 独立滚动** | 标题栏和操作按钮始终可见 |
| 强制高度 | 删除 132px 下限 | 已知越界原因 |
| 高度预算 | 视口/祖先可见边界与完整外框尺寸共同约束 | 避免窗口外层留白越界 |
| 动画完成 | **保留 `hidden + 面板局部 transitionend + 240ms timer + inert`** | `hidden` 同时标记收起动画层级生命周期 |
| 开关状态 | 保留 `isOpen` 作为唯一 JS 决策状态 | `playlist-open`、`inert`、ARIA 只是派生输出 |
| `ResizeObserver` | 保留 | 尺寸变化需要重定位 |
| `MutationObserver` | 删除并回归 | 定位计算与歌单节点内容无关 |
| document 级 `transitionend` | 优先删除，按真实场景验证 | 避免无关页面动画触发定位 |
| `data-placement="below"` | 无引用时删除 | 单一方向的历史字段 |

明确不加入自动滚动页面/侧栏、`data-compact`、整窗滚动、滚动完成协调逻辑及通用 AccordionManager。调色板的交互实现保持独立。

## 3. 文件与模块改动清单

| 相对路径 | 工作 |
| --- | --- |
| `src/components/MusicWidget.astro` | 选择性采用 Gemini 的 `.playlist-accordion`、Aero 窗口、关闭按钮和原有 `hidden inert` 初始属性 |
| `src/scripts/playlist-position.ts` | 下方高度约束；删 132px、MutationObserver、无用 placement；验证 document 级过渡监听 |
| `src/scripts/playlist-panel.ts` | 保留 `isOpen`、关闭动画双路径收尾、焦点、外部点击、Escape、Astro 生命周期；核对派生状态同步 |
| `src/scripts/playlist-touch.ts` | 沿用 Gemini 触屏保护，只有迁移兼容需要时才改动 |
| `src/styles/_partial/_widgets/_music.scss` | 保留 Aero 与歌曲区独立滚动；修复完整高度预算和减少动画覆盖顺序 |
| `src/styles/_partial/_main.scss` | 保留 Sticky 层级在收起动画期间持续有效的选择器 |
| `src/scripts/music.ts` / 播放会话 | 沿用 Static 行为，必要时调整接入，避免扩散到音频业务逻辑 |

`ThemeSwitcher.astro`、`theme.ts` 和调色板样式不因本次歌单修复而自动纳入；只有代码差异证明共享依赖时才单独评估。

## 4. 位置计算与完整高度预算

### 4.1 真实可用高度

保留 Gemini 版现有 `visualViewport`、祖先滚动/裁剪边界交集计算，以及播放器与控制区的锚点：

```ts
const anchorBottom = Math.max(
  player.getBoundingClientRect().bottom,
  controls.getBoundingClientRect().bottom
);
const panelTop = anchorBottom + gap;
const availableOuter = Math.max(0, bottom - panelTop);
const availableWindow = Math.max(0, availableOuter - outerPaddingY);
```

其中：

- `bottom` 为视口与可裁剪祖先共同允许的下边界，维持当前 12px 边缘间距。
- `gap` 继续采用当前 8px 的锚点间距。
- `outerPaddingY` 仅计算 `.playlist-window` **外部**的垂直间距。Gemini 当前 `.playlist-accordion-inner` 上下 padding 分别为 2px、6px，合计 8px。
- `.playlist-window` 应采用 `box-sizing: border-box`。其内部边框、padding 和标题栏都包含在窗口 max-height 里，JS 不得重复扣除。
- 删除 `minHeight = 132` 与 `Math.max(minHeight, below)`，允许 `availableWindow` 为零。
- 不再计算标题栏/操作区最低高度，不自动翻转或滚动外部容器。

原来的 `--playlist-max-height` 限制 `.playlist-window`，但这个窗口外还有 `.playlist-accordion-inner` padding。开发时还需让外层整体受 `availableOuter` 约束，或等效裁切外层，保证剩余空间小于 8px 时 padding 也不会越界。优先通过单一 CSS 上限/裁切规则处理，不引入运行时“紧凑模式”。以实际 `getBoundingClientRect()` 验证边界，不只检查变量。

### 4.2 滚动行为与极矮空间

保留 Gemini 的 Flex 结构：

- `.playlist-accordion` 负责 Grid 展开与收起。
- `.playlist-accordion-inner` 保留动画裁切和窗体阴影外侧留白。
- `.playlist-window` 使用纵向 Flex、最大高度约束。
- `.win7-title-bar`、`.playlist-heading`、`.playlist-actions` 保持不随歌曲滚动。
- `.playlist-window-body` 维持 `flex: 1 1 auto; min-height: 0; overflow: hidden`。
- **仅 `.playlist-items` 维持 `flex: 1 1 auto; min-height: 0; overflow-y: auto`，保留正常列表上限 `max-height: min(45vh, 220px)`。

当播放器下方空间小于标题栏与操作区高度时，歌曲区可以暂时不可见。由用户自行滚动页面/侧栏后，已有滚动监听重新定位。验收需检查不可见歌单项是否仍可 Tab 聚焦；若真实复现，再在现有架构内做针对性的最小修复。

## 5. 动画、状态与层级

### 5.1 减少动画

将针对 `.playlist-accordion` 的媒体查询移到手风琴基础规则和展开规则**之后**，确保覆盖生效：

```scss
@media (prefers-reduced-motion: reduce) {
  .playlist-accordion {
    transition: none;
  }
}
```

普通模式保留 `grid-template-rows 220ms` 和 `opacity 180ms`。减少动画模式收起时，现有 `playlist-panel.ts` 通过 `matchMedia.matches` 同步设置 `hidden`。检查偏好启用前后的状态、快速操作和键盘焦点。

### 5.2 保留现有 `hidden` 关闭流程

不采用上一轮讨论的 CSS `visibility` 替代方案。当前两处规则依赖窗口收起动画期间尚未隐藏的状态：

- `.sidebar-sticky-group:has(.playlist-open, .playlist-accordion:not([hidden]))`
- `.music-widget:has(.playlist-accordion:not([hidden]))`

关闭时应立即更新 `isOpen=false`、`inert=true`、`aria-expanded=false` 与样式类；动画期间继续保持较高层级。面板本身的 `transitionend` 优先在 220ms 动画结束时设 `hidden`，240ms timer 为事件未触发的兜底。快速再次展开先清理旧 timer。减少动画、释放或不可连接时立即 `hidden`。

**此处的面板局部 `transitionend` 必须保留；待删的是定位模块中对整个 document 的 `transitionend`。两者作用不同。**

### 5.3 单一决策状态

保留 `playlist-panel.ts` 的 `isOpen`。由同一个 `setOpen(open)` 同步 `playlist-open` CSS 类、`inert`、按钮 `aria-expanded`、文案和定位/触摸监听。不要从 CSS 类或 `hidden` 反推运行中的用户操作状态，也不另建状态管理抽象。

Astro 的 `before-swap`、`page-load`、销毁清理及持久播放器重接入保持原有语义。

## 6. 精简有证据支持的冗余项

### 6.1 `MutationObserver`

Gemini 版 `music.ts` 的 `render()` 用 `playlistItems.replaceChildren(...)` 更新列表，但定位算法没有读取歌曲列表内容或其自然高度。Flex 和列表滚动会自行响应歌曲增减。

删除 `playlist-position.ts` 中的观察器变量、创建、`observe` 和 `disconnect`；若 `items` 参数无其他用途，同步从函数签名与调用移除。无需新增 `render() → position()` 通知。验证加载、刷新、大量歌曲、空列表与错误反馈。

### 6.2 全局 `transitionend`

先尝试移除定位模块里的：

```ts
document.addEventListener('transitionend', schedule, {
  capture: true,
  signal
});
```

验证桌面 Sticky 侧栏、移动抽屉的开合动画、浏览器缩放、滚动与 Astro 导航。若具体过渡确实改变锚点且现有 `scroll` / `resize` / `ResizeObserver` 未覆盖，只在对应组件上增加定向监听，不恢复全文档监听。

### 6.3 `data-placement`

全仓搜索 `data-placement`。如无样式、事件及测试读取，仅留下 `panel.dataset.placement = 'below'`，则删除赋值及不再适用的历史分支。

## 7. 实施步骤与完成门槛

1. **准备隔离变更。** 在 Static 工作分支或工作树上比较 Gemini 副本，迁入歌单相关文件，保留现有播放会话和导航契约；不覆盖整个产物目录。
2. **修高度。** 删除 132px 下限，预算完整窗口外框，首先修复 1280×560 已知越界；保持歌曲列表独立滚动。
3. **修减少动画。** 调整 CSS 规则顺序；完整保留 `hidden + 面板局部 transitionend + timer`。
4. **清理冗余。** 删除 `MutationObserver` 和无引用的 `data-placement`；针对性验证后尽量删除 document 级 `transitionend`。
5. **测试和浏览器验收。** 保留关键截图与问题复现记录，通过后审查与 Static 的差异。
6. **合并至 Static。** 仅在回归和代码审查通过后合并。NAS 发布按项目既有流程另行进行。

### 7.1 验收矩阵

| 场景 | 通过条件 |
| --- | --- |
| 1280×560 | 已知越界消失，可见外框底边不超过有效边界（DOM 测量容许 1–2px 误差） |
| 1280×720 / 常规桌面 | Aero 样式、始终向下、正常 220ms 动画一致 |
| 浏览器 125% / 150% 缩放 | 高度随有效视口变化，窗口不出现新的溢出 |
| 390×844 / 移动抽屉 | 标题栏和操作区固定，歌曲列表原生触摸滚动，抽屉开合后位置正确 |
| 极矮视口 / 锚点贴底 | 接受列表不可见的边界；不被强制撑高，不产生不可见控件的焦点问题 |
| 长列表 / 刷新 / 空歌单 / 错误反馈 | 更新后滚动与尺寸正常；移除 MutationObserver 后无回归 |
| 快速展开、收起和重新展开 | 旧计时器失效，`hidden`、层级与 `inert` 一致 |
| 外部点击 / Escape / 关闭按钮 / 选曲 | `isOpen` 与 CSS、ARIA 同步，焦点按既有规则恢复 |
| 减少动画 | 展开与收起均无 220ms/180ms 过渡，关闭同步 `hidden` |
| Astro 跨页、后退、组件销毁 | 事件和观察器正确清理/重接；播放器会话行为不变 |

正常可见空间下用 `getBoundingClientRect()` 检查外框与有效下边界，并核对标题栏、阴影留白和滚动条。需要区分布局盒的越界与纯阴影视觉延伸。

### 7.2 构建与自动化

实施工作树执行：

```sh
npm run check
npm run test:playlist
npm run build
```

优先复用工作区已有 `output/playwright/playlist-review-interactions.cjs` 和 `output/playwright/playlist-review-motion.cjs`，根据实际构建路径调整参数。浏览器缩放、移动抽屉、Sticky 动画应进行真实浏览器验证。

## 8. 合并验收与交付

合并前应有：相关文件差异、两项缺陷的复现/修复证据、核心交互与移动端回归结果、自动化检查结果，以及对任何极端高度限制的简短记录。实施完成后更新 [歌单浮层与播放器接入](playlist-panel.md) 中的模块描述与验收信息。

## 9. 实施与验证记录

2026-11-13 已在隔离工作分支选择性迁入 Aero 播放列表代码，修复完整外框高度预算和减少动画规则顺序。定位只使用有效下边界，外层 Grid 容器的 `max-height` 与窗口的 `max-height` 分别限制实际剩余空间、扣除 8px 外部留白后的空间。`isOpen` 继续统一驱动样式、`inert` 与 ARIA，保留 `hidden`、局部过渡完成监听和 240ms 兜底；删除定位模块的 `MutationObserver`、document 级 `transitionend` 与历史 `data-placement`。

自动化结果：`npm run check` 为 0 errors / 0 warnings / 0 hints，`npm run test:playlist` 为 67 项通过，`npm run build` 生成 8 个静态页面。测试覆盖外框下方余量 280px、4px、0px，以及祖先裁剪后余量 20px 的高度预算。

本地 Chrome 使用静态构建和真实 DOM 测量。1280×560 时浮层外框为 `top=462px, bottom=548px`，符合视口 12px 的底部边距，内部 Aero 窗口底边为 542px；1280×720 时长列表独立滚动，标题栏与操作区始终固定。等效 CSS 视口 1024×448、853×373 检查了更紧凑的显示尺寸。390×844 移动端抽屉内注入 20 项测试歌曲，歌曲区从 `scrollTop=0` 滚动到 `160` 后，标题栏与操作区位置不变。Astro 从首页到 `/about/` 导航后，音乐播放器继续复用同一 DOM 节点。

系统减少动画模拟下，浮层的计算过渡时长为 `0s`，关闭立即 `hidden=true, inert=true`。普通动画下，关闭阶段保持 `inert=true`，动画结束后设置 `hidden`，快速再次打开可正确取消旧关闭收尾。1280×350 且播放器原锚点超出可见下边界时，外层浮层压缩到 0px，内部窗口被外层裁切；键盘聚焦时浏览器自身会滚动页面，使聚焦控件重新进入可视区域。接受这种极矮视口边界，不加入应用层自动滚动或模式切换。

以上缩放场景采用等效 CSS 视口测试，移动端采用 Chrome 设备仿真。物理手机的原生惯性触感及 NAS 实际发布仍按既有部署流程验收。
