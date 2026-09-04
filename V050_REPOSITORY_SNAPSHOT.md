# V0.5.0 Repository Snapshot

本文件用于标记 `main` 分支当前到 V0.5.0 的完整仓库状态。

## 当前主版本

- Version: `0.5.0`
- Canonical branch: `main`
- Repository: `duyedoudou/governance-ai`

## 已纳入主仓库的代码

- `site/`：当前前端、桌面/移动端管理员入口、AI村长头像、参考资料连续追问、DOCX 交互集成。
- `netlify/functions/api.mts`：治理查询、参考数据、上传/发布、版本化数据集与审计 API。
- `netlify/functions/docx.mts`：DOCX 全文解析、旧文档重新解析与文档问答支持。
- `netlify/database/migrations/`：001~005 数据库结构、Demo seed、数据治理、数据集版本化和完整 Demo 快照补齐。
- `package.json` / `netlify.toml` / `deploy-macos.command`：V0.5.0 依赖与部署配置。

## 已纳入的相关数据

- `data/demo-snapshot-v050/`：公开演示环境的完整 `sys-*` Demo 数据快照。
- 包含人口、家庭、养老、民政关爱、应急转移、应急费用、政策等演示数据，以及 manifest/status 元数据。
- `netlify/database/migrations/005_complete-demo-snapshot/` 可补齐当前 V0.5.0 Demo 数据。

## 历史版本资料

V0.4.3 ~ V0.5.0 的 changelog、设计规范、自查记录继续保留，用于追溯版本演进。

## 清理策略

历史 `.bootstrap` 恢复包曾存在压缩流损坏，已从当前主仓库移除；不再作为部署或恢复依据。当前 `main` 中的源码和 migration 是唯一正式基线。

## 未提交的数据

仓库为公开仓库，因此不提交生产环境中的管理员真实上传文件、真实个人信息、审计日志、API Key、环境变量或其他私密运行时数据。它们继续保留在 Netlify Database / Blobs / Environment Variables 中。
