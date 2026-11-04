# 前端工具阶段 B：最小适配与本地验证

2026-11-03（America/Los_Angeles）。阶段 B 已实现并完成本地检查。没有部署到云端或 NAS；阶段 A 的移动兼容性未通过项继续保留，不能据此宣布完整移动支持或稳定发布。

[结构化结果与样本摘要](embedded-tools-phase-b-2026-11-03.json)保留本轮环境、7 组实际接入检查和回归计数，不包含机器绝对路径或凭据。

## 实现范围

- `remarkNoteAssets` 在普通图片处理前识别精确的小写 `tool:` 标记，支持直接式和引用式图片，要求非空名称，并转义 iframe title。
- `resolveNoteAsset(..., 'tool')` 仅接受相对本地 `.html`，检查真实目标类型，拒绝查询、片段及字面百分号输出路径；路径、共享附件、符号链接、去重和冲突沿用现有流程。
- 生成带部署 base 和文章 ID 的完整 iframe URL，固定 `sandbox="allow-scripts allow-downloads"`、懒加载和 `referrerpolicy="no-referrer"`。
- 开发附件 middleware 对计划中的 HTML 返回 `text/html; charset=utf-8`，保持原字节；HEAD 返回正确长度且无正文，未引用文件不增加访问入口。
- iframe 占满正文宽度，高 480px、内部滚动。新增中英文使用说明和可复制计算器示例，示例默认不发布。

没有新依赖，没有修改 package/锁文件、BaseLayout、客户端脚本、发布器或部署配置。附件计划仍为版本 1 的 `{source, target}`。没有新资源注册系统、依赖扫描或权限声明机制；HTML 本身不重新编译或注入代码。

## 当前 2048 样本

按用户补充要求，检查实际读取工作区根目录的 `2048/2048.html`，没有默认改用阶段 A 快照，也没有修改该文件。

- 大小：21,662 字节。
- SHA-256：`e83f59faf0d6f0ae527e827d4298b3ebd9f8dd1711ff4ff3fb7ab9ecb86f42c7`。
- 本轮摘要与阶段 A 一致；脚本仍从当前输入读取，未来样本改变会得到新摘要。

`phase-b.mjs` 将样本复制到临时日记目录，通过真正的已发布 MD、loader、remark、附件计划与 dev/build 接入，未手写 iframe 冒充编译结果。临时主题和浏览器服务执行后清理，日志、JSON 及截图留在忽略的 `.astro/embedded-tools-phase-b/`。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| `test:content` 对应的内容与发布入口 | 27 项通过，0 失败，0 跳过 |
| `test:resources` 对应的资源与导出入口 | 7 项通过，0 失败 |
| Astro check | 70 文件，0 错误、0 警告、0 提示 |
| 默认静态构建 | 8 页面，通过 |
| 当前 2048 实际接入脚本 | 7 组检查通过，Chrome 148.0.7778.179 |

新增的 5 项工具测试属于上述 27 项，不重复计数。它们覆盖 root/base、中文与特殊字符、固定权限、标题转义、引用式写法、普通 HTML 链接/图片不自动转换、同文章去重与跨文章副本、仅剩普通链接时保留附件、移除最后引用后清理、未发布笔记跳过，以及非法目标和符号链接拒绝。

既有真实 build/dev 用例补充了 HTML 原字节、单独更新、GET/HEAD、未引用 HTML 排除、撤稿和切换笔记目录清理。资源回归包含真实导出及 Git-free Publisher 构建，用于验证现有流程未被破坏，不等同于已完成所有工具专属生产发布检查。

实际样本的 7 组检查：

1. 根路径由 Markdown 生成正确 iframe，工具复制字节一致。
2. `/blog/` 同样通过，不重复添加部署前缀。
3. 实际 dev 返回正确 MIME/原字节，未引用 HTML 返回 404。
4. 同一 document 的 ClientRouter 导航进入真实文章；工具启动、标题引号不变成 onload 属性、固定权限和 480px 样式生效，JSON 导入后下载重读一致。
5. 历史返回使旧 iframe 脱离文档，重新进入游戏从初始状态开始，没有未捕获错误。
6. 中英文计算器示例均能计算、导出正确 JSON、拒绝空输入。
7. 副本中仅修改 HTML 后开发响应更新；撤稿后文章和工具 URL 均停止响应。

## 复现与验收界限

Node 24.22.1、Astro 7.3.8，依赖未改变。Playwright 使用运行时现有库，未安装新依赖。复现命令见[实验说明](../embedded-tools/README.md)。截图关闭有限动画以避免捕获断点切换中间帧，不据此宣称实体触屏通过。

阶段 C 仍需工具专属发布/导出与完整多浏览器回归，继续定位 Chrome iframe 触屏模拟点击和 Windows WebKit 长页问题。实体手机、稳定 Safari、NAS、只读挂载与线上 URL 不能由本轮 Chrome/dev 结果替代。没有通过同源权限、触摸代理、全局路由改写或新切页脚本掩盖这些限制。

设计见[ADR-0014](../../../docs/adr/0014-static-embedded-tools.md)，作者写法见[中文配置指南](../../../docs/zh-CN/CONFIGURATION.md#嵌入单文件-html-工具)与[English guide](../../../docs/en/CONFIGURATION.md#embedded-single-file-html-tools)。
