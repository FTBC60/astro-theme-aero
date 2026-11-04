---
status: accepted
---

# 0014：静态文章的单文件 HTML 工具与固定双权限

2026-11-03（America/Los_Angeles）。2048 的 JSON 导入和下载导出需要在现有静态写作流程内运行。阶段 A 的[实测与限制](../../tools/test/validation-docs/embedded-tools-phase-a-2026-11-03.md)收敛后，用户授权进入阶段 B，现已完成[最小适配与本地验证](../../tools/test/validation-docs/embedded-tools-phase-b-2026-11-03.md)。本 ADR 标为已采用，表示设计与实现已落地；各环境验收分别记录。

首版允许已发布文章使用 `![tool: 名称](./tool.html)` 嵌入作者审查过的自包含 HTML，固定 `sandbox="allow-scripts allow-downloads"`。统一下载能力满足实际导出需求，避免增加权限声明、配置继承或授权子系统；代价是无需下载的工具也获得下载能力。工具声明不直接构成授权，不开放同源、表单、弹窗或顶层导航。接受同源 HTML 直接访问不继承 iframe 隔离这一信任前提，不将本功能表述为不可信代码沙箱或离线执行配额。

MD 继续按源文件相对路径引用，同目录及 notesDir 内共享路径沿用附件计划；编译器生成带部署前缀、分段编码的完整 `.html` URL。不同文章保留各自副本。HTML 按原字节交付，不扫描依赖、不建立全站工具目录。JSON 存档由访客选择文件和下载保存，不自动加入 Vault 或网站产物。发布筛选和撤稿沿用现有契约，只补兼容性验证，不新增工具发布器或动态服务。

实测 Chrome 正常切页无需工具补丁；WebKit 的长页崩溃在无 iframe 对照中也复现，旧重建补丁未改善。因此不增加生命周期脚本。Cloudflare 会区分并存的平面 HTML 和文件夹入口，暂不建立通用 URL 冲突系统。当前 Wrangler/API 拒绝含字面百分号的文件名，工具输出路径校验明确拒绝该字符，不自动改名或顺带改写普通附件发布器。

首版仍不支持框架编译、资源依赖扫描、远程接口、父子通信或跨页状态；480px 高度保持暂定。[阶段 C 本地验收](../../tools/test/validation-docs/embedded-tools-phase-c-2026-11-03.md)的 Publisher、导出、撤稿和桌面链路通过；Chrome 触屏轻点与 iframe 内手指滚动仍失败，点击已缩到无 Astro/游戏代码的反例。Windows WebKit 的真实文章矩阵本轮通过，不能据此宣称阶段 A 手写长页崩溃已修复。

随后[阶段 D](../../tools/test/validation-docs/embedded-tools-phase-d-2026-11-03.md)实际更新 NAS，验证只读挂载和匹配工具链，并通过四轮真实 Worker 发布、线上文件往返、工具更新、单篇撤稿及最终清理。用户又补充 iPhone Chrome 棋盘滑动、非棋盘区域滚动及父页面滚动实机正常，按用户反馈通过记录。桌面 Chromium 模拟失败独立保留；其他设备/能力、独立 Safari、手机同步和本轮定时触发仍未完整覆盖。区域手势的观察不等于已证明焦点因果，设计契约和实现范围保持原定方案。
