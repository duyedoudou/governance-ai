# 黄林坑村治理智能助手 V0.4.9

本版重点：对参考数据全部系统内置资料做统一查询路由自查，彻底解决中文标题与 `asset_id` 混用导致的“库里有数据却提示资料不可用”问题。

详细自查见 `V048_ROUTING_AUDIT.md`。


本版严格依据根目录 `DESIGN.md`（Civic AI Design System v1.0.0）重构 UI。

## 本版重点

- 首屏撤掉左侧管理后台导航，改为 64px 顶部导航。
- AI 对话入口成为唯一视觉中心，并固定在页面底部。
- 首屏只保留标题、一行说明、AI 输入、三个能力卡片和信任信息。
- 不增加公告、服务宫格、数据大屏、人物宣传图或复杂栏目。
- 参考数据、审计记录、数据治理均降为二级入口。
- 保留 V0.4.4 的模型、Function、Database、参考数据、治理上传与发布能力。
- 390 / 768 / 1440 三档响应式规则已对照 DESIGN.md Acceptance Checklist 检查。

## 部署

macOS 双击 `deploy-macos.command`，部署到既有 Netlify 项目。

## V0.4.9 重点
- 桌面管理员入口改为“演示管理员⌄”。
- 参考资料上下文跨连续追问保持，直到用户主动退出。
- 管理员上传资料引入 dataset_id + version_number + current version 机制。
- 新 migration：`004_dataset-versioning`。
