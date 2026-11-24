# 固定壁纸与全页长截图纹理修复方案

> - 日期：2026-11-23（America/Los_Angeles）
> - 状态：已实施，Chrome 148 验证通过
> - 目标仓库：`astro-theme-aero-static`
> - 兼容目标：Windows 7 Chrome 109、Firefox 115 ESR，以及现代桌面与移动浏览器

## 1. 目标与结论

博客日常滚动时，背景壁纸保持相对视口固定，页面内容在其上滚动。使用 Chrome DevTools 的 **Capture full size screenshot** 时，从页面顶部到页脚持续显示同一张壁纸的纹理，并通过纵向重复填满长截图。

采用 **`html` 画布平铺背景 + `body` 固定背景** 的双层 CSS，两个层次使用同一个 `--bg-image` 和 `--bg-position`，均按 `cover` 缩放。`html { height: 100vh; }` 将根背景的定位与缩放基准设为首屏高度，使两层在视口内采用一致的裁切比例。根背景在画布上沿纵向重复，填充长截图中固定背景没有覆盖的区域。

壁纸仍由既有 `themeConfig.wallpaper` 单独配置，支持不同宽高比及作者自定义的 `wallpaperPosition`。默认图片现使用 `public/image/wallpaper-tile.jpg`。无需维护截图专用壁纸，也无需为图片宽高比编写计算公式。

## 2. 现有实现与 Gemini 提醒的两项检查

| 检查项 | 现有源码 | 结论 |
| --- | --- | --- |
| 根元素 `html` 的 `overflow-x: hidden` | `src/styles/` 中没有作用于 `html` 的 `overflow-x` 或 `overflow` 声明 | 当前不存在这项冲突。保持 `html` 默认 `overflow: visible`。 |
| `body { height: 100% }` | `src/styles/_partial/_main.scss` 中 `body` 没有固定高度。`.container` 使用 `min-height: 100vh` | 当前不存在这项冲突。保持 `body` 自动随内容增长。 |

相关的现存布局规则仍需保留。

- `src/styles/_partial/_header.scss` 的 `.header` 使用 `position: sticky; top: 0`。
- `src/styles/_partial/_main.scss` 的 `.sidebar-sticky-group` 使用 `position: sticky; top: 140px`。
- `src/styles/_partial/_responsive.scss` 将窄屏 `aside` 设为固定定位并允许内部纵向滚动。
- `src/styles/_compatibility.scss` 的 `body.sidebar-open { overflow: hidden; }` 只在窄屏抽屉打开时生效，由 `src/scripts/sidebar.ts` 切换。该规则负责抽屉展开时的页面滚动锁定，应维持现有逻辑。

Gemini 对根元素 `overflow-x: hidden` 的担忧有技术依据。CSS 两个轴的 `overflow` 会相互影响，当一轴为 `hidden` 而另一轴为 `visible` 时，后者的计算值会转为 `auto`。不过这不等于根元素一定会让 `window.scrollY` 失效，仍取决于实际滚动容器和浏览器实现。由于当前项目没有根元素横向裁剪规则，**无需为本次修复引入 `overflow-x: clip`**。

## 3. 已实施的 CSS

已在 `src/styles/_partial/_main.scss` 增加根元素样式，并补充 `body` 的背景重复声明。下列 `body` 示例只列出背景有关的属性，其余字体、颜色和间距规则保持原样。

```scss
html {
    height: 100vh;
    background-color: var(--primary-color);
    background-image: var(--bg-image);
    background-size: cover;
    background-position: var(--bg-position);
    background-repeat: repeat-y;
}

body {
    background-image: var(--bg-image);
    background-size: cover;
    background-position: var(--bg-position);
    background-repeat: repeat-y;
    background-attachment: fixed;
}
```

这组规则有三个互相配合的条件。

1. **同一图片与同一焦点**。`BaseLayout.astro` 已在 `<html>` 上设置 `--bg-image` 和 `--bg-position`，两层直接复用。保持现有 `wallpaperPosition: 'center center'` 默认值，继续支持 `70% center` 等作者自定义焦点。
2. **同一视口 `cover` 基准**。`body` 的 `background-attachment: fixed` 以视口作为背景定位区域。根元素显式设为 `100vh`，使其 `cover` 使用相同高度基准。图片宽高比由浏览器自动处理，不再写死 4:3、`75vw`、`133.333vh` 等比例。
3. **根画布纵向平铺**。根元素的背景会绘制到文档画布，`background-repeat: repeat-y` 使长截图首屏以下的区域继续呈现纹理。`body` 的固定背景负责日常滚动观感。

保持 `html` 的默认 `overflow` 行为，保持 `body` 的高度为自动值，继续使用 `.container { min-height: 100vh; }` 承载整页布局。不要加入 `body::before`、额外 HTML 包装层、截图模式检测或 GPU 强制合成声明。

### 3.1 默认图片及作者自定义图片

已将 `src/config/theme.config.ts` 的默认 `wallpaper` 指向已有的 `/image/wallpaper-tile.jpg`；`BaseLayout.astro` 的变量注入流程保持原样。主题对外继续只有一项壁纸路径配置，作者可以直接改用其他本地图片或 HTTPS 图片。

`wallpaper-tile.jpg` 为 2048 × 3072，来自 2048 × 1536 原图与其上下翻转版本的拼接。它的上下边缘色彩接近，适合 `repeat-y`。任意比例的替代壁纸都能按相同的 `cover` 规则显示。**纵向平铺是否视觉无缝取决于图片自身的上下边缘**。普通非平铺图片在每个重复周期之间可能出现接缝，镜像拼接是准备无缝素材的一种可选方法，不应成为主题配置或代码的硬性前提。

`cover` 仍会随视口比例对图片进行正常裁切，符合主题当前的日常背景行为。新的方案避免的是基于某张图片 4:3 比例进行的额外、错误裁切。

## 4. 临时实验的证据

此前通过 Windows 本地 **Chrome 148**、真实 Astro 首页、浏览器临时注入的 CSS 和 CDP 全文档截图进行了桌面与窄屏对照。向页面临时插入 14 张测试卡片，以确保长截图高度超过首屏。

| 方案 | 928 × 621 首屏交界色差 | 390 × 844 首屏交界色差 | 观察 |
| --- | ---: | ---: | --- |
| 原样，仅有 `body` 固定背景 | 314.1 | 340.7 | 长截图出现明显底色断层 |
| 根背景 `100% auto`，`body` 用 `cover`，镜像图 | 1.0 | 184.6 | 窄视口两层缩放不一致 |
| **根元素 `100vh`，两层 `cover`，镜像图** | **2.3** | **2.6** | 两个视口均保持纹理连续 |
| 同一候选 CSS，使用未处理的原始图片 | 5.2 | 210.6 | 图片首尾接缝在窄屏明显 |

上述色差是首屏交界处、背景可见区域上下相邻像素的平均 RGB 距离，越接近 0 越平滑。最终候选方案的日常滚动背景抽样在两个视口中均保持一致。镜像图片与 `70% center` 焦点的组合也做过临时验证。

2026-11-23 再次在 **Chrome 148** 上临时注入本方案，核对实际布局指标。

| 指标 | 桌面 928 × 621 | 窄屏 390 × 844 |
| --- | --- | --- |
| `html` 计算高度 | 2982px → 621px | 3035px → 844px |
| 文档 `scrollHeight` | **2982px → 2982px** | **3035px → 3035px** |
| 页脚在文档中的顶部坐标 | **2902px → 2902px** | **2955px → 2955px** |
| 滚动到 700px | `window.scrollY = 700` | `window.scrollY = 700` |
| 滚动到底部 | `window.scrollY = 2361` | `window.scrollY = 2191` |
| Sticky 与抽屉相关状态 | 顶部 `.header` 停在 0px，侧栏 Sticky 停在 140px | 侧栏按原有移动端规则设为 `position: static`，抽屉开合时 `body` 的 `overflow` 在 `visible` / `hidden` 间正确切换 |

实验说明，**在当前工程结构与测试浏览器中**，根元素高度固定为视口高度没有截断文档、改变页脚位置或破坏窗口滚动。测试脚本和截图保存在工作区外的本地 Codex 临时实验目录中。

## 5. 兼容性与待验收行为

CSS 使用的 `100vh`、自定义属性 `var()`、`background-size: cover`、`background-repeat: repeat-y`、`background-position` 和 `background-attachment: fixed` 均属于目标浏览器已支持的既有功能。方案不需要引入新的选择器、视口单位或 JavaScript 截图检测。

后续按下列组合完成跨浏览器验收。

| 环境 | 主要检查 |
| --- | --- |
| Windows 7 Chrome 109 | 首页和长文章的日常滚动、Sticky、页脚、DevTools 全页截图纹理与交界 |
| Windows 7 Firefox 115 ESR | 上述滚动与布局行为、Firefox 全页截图或浏览器截图工具的根背景绘制 |
| 现代桌面 Chrome / Firefox | 928px、1440px 等不同窗口宽度的连续纹理，以及 Astro 页面切换后背景一致性 |
| 现代窄屏与真实手机 | 390 × 844 等竖屏尺寸、抽屉开合和滚动锁定、地址栏变化后的壁纸定位 |
| 作者自定义设置 | 原图、镜像平铺图、不同宽高比壁纸以及 `center center`、`70% center` 等焦点 |

特别检查长文章末端与页脚附近是否有底色露出，以及页面内容、浏览器滚动条与浮动播放器是否出现位置异常。对带明显首尾差异的图片，应记录可见接缝，这属于素材平铺性质。

正式实施后使用 **Chrome 148** 对生产构建再次截图，928 × 621 视口的全页高度为 2982px，390 × 844 视口的全页高度为 3035px。两个视口的根元素均保持视口高度，`background-repeat` 为 `repeat-y`，`body` 的 `background-attachment` 为 `fixed`。在首屏交界左右边缘的抽样相邻像素 RGB 差异合计为 0–7，首屏以下的背景抽样均包含多种颜色。滚动 700px、滚动至页底后，文档总高度及页脚文档位置保持一致。

`npm run check` 通过（91 个文件，0 errors / 0 warnings / 0 hints），`npm run build` 通过（8 个页面），`npm run test:release` 通过（168 项测试、0 失败）。目标 **Chrome 109 / Firefox 115 ESR** 的逐项实机验收仍待进行。

## 6. 实施范围与当前状态

本次正式实施修改了两个现有文件。

1. `src/styles/_partial/_main.scss` 增加 `html` 根画布背景及 `body` 的纵向重复声明。
2. `src/config/theme.config.ts` 将默认壁纸路径切换为 `/image/wallpaper-tile.jpg`，以便默认主题直接获得较平滑的纵向平铺纹理。

`src/layouts/BaseLayout.astro` 已提供可复用的壁纸变量，不需要改动。保留 `.container`、Sticky、移动端抽屉和滚动锁定的现有实现。

本次已完成主题 SCSS 和默认壁纸路径调整，复用现有 `wallpaper-tile.jpg`。目前修改保留在本地工作区，尚未提交或推送 Git。

### 参考规范

- [W3C CSS Backgrounds and Borders Level 3](https://www.w3.org/TR/css-backgrounds-3/)：根元素背景绘制到画布，以及固定背景的定位区域。
- [MDN `background-size`](https://developer.mozilla.org/en-US/docs/Web/CSS/background-size)：`cover` 缩放规则和 `fixed` 背景定位区域。
- [MDN `overflow-x`](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-x)：横纵向溢出计算值的联动行为。
- [Windows 7 浏览器兼容决策](../adr/0020-windows-7-browser-compatibility.md)：项目的最低浏览器兼容目标。
