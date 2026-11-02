---
status: accepted
---

# 0001：在构建时生成 Markdown 正文与 MathJax SVG

原有 Astro 静态主题需要支持 LaTeX，同时保持客户端切页后的显示一致。2026-10-18 明确选择在构建时渲染公式，让访客收到包含公式的 HTML，无须加载 MathJax 浏览器脚本或在每次切页后重新排版；2026-10-19 以 `e49ff26` 落地。

改动在 [astro.config.mjs](../../astro.config.mjs) 中使用 Unified、`remark-math` 和 `rehype-mathjax/svg`，保留代码高亮，并增加长公式横向滚动、公式示例和中英文说明。相比浏览器渲染，这把计算和兼容性检查放到构建阶段，也意味着正文修改仍需构建部署。后来的静态主线继续采用完整 HTML 构建，未切换到浏览器加载 Markdown；动态实验则曾复用此渲染配置，在发布时编译正文。

依据：[S03](SOURCES.md#s03) L78 用户明确选择构建时渲染、L331 实现报告；提交 `e49ff26`。当前写作行为见[配置指南](../zh-CN/CONFIGURATION.md)。本次只核对实现与旧记录，没有重跑公式验收。
