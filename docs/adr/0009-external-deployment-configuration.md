---
status: accepted
---

# 0009：每次发布读取外置 Wrangler 配置

发布器初版通过 Compose 的 `WORKER_NAME` 和脚本内部默认值生成部署配置。域名、预览地址等经常需要调整，直接修改工具会重新触发镜像构建；2026-10-27 用户明确要求将这些参数外置。

`862d7b8` 将主题根目录 [wrangler.json](../../wrangler.json) 设为部署参数的唯一来源，由 [deployment-config.mjs](../../tools/lib/deployment-config.mjs) 在每次任务开始时读取和校验，并固定本次快照；不使用旧 `WORKER_NAME` 或镜像配置回退。Worker 名称、路由和支持的 Assets 行为在这里配置，Account ID 与 Token 继续由 Compose 环境提供。文件不放入 `public/`，不进入站点上传产物。

发布工具只允许该静态流程支持的字段，上传目录由工具固定为检查后的产物，不能由外部配置扩大上传范围。未知或无效配置在构建前失败。普通参数修改在下次任务生效，无须重建镜像；发布工具或依赖变化仍按 [0008](0008-isolated-scheduled-publisher.md) 重建。

配置文件不是 Cloudflare 资源清理器：当时固定的 Wrangler 4.152.0 对空路由列表会跳过相应操作，因此 `routes: []` 不保证移除已有最后一个域名绑定，解绑操作另行在控制台处理。Access 策略也不由该文件生成。

依据：[S15](SOURCES.md#s15) L269 外置配置要求、L381 完成报告、L423 提交及待验状态；提交 `862d7b8`。历史记录为本地 11 项发布测试、构建、导出与 Wrangler dry run 通过；**最新更新仍待 NAS 重建复验**，不能用此前的定时成功代替该项验收。本次未连接 NAS 或重新部署。
