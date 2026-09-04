# 黄林坑村治理智能助手 V0.5.0

这是当前到 **V0.5.0** 的主代码仓库。`main` 分支作为唯一当前版本，不再依赖历史 `.bootstrap` 恢复包。

## 当前能力

- 自然语言查询人口与家庭、养老保险、民政与关爱、应急防灾、政策文件等已发布治理数据。
- 参考数据使用稳定 `asset_id`，避免中文资料标题与 `asset_id` 混用造成“库里有数据却查不到”。
- 管理员数据治理：上传、自动分类、人工确认发布、数据集版本管理与 current version。
- 管理员入口同时适配桌面端和移动端。
- AI 回答头像使用 `site/assets/ai-village-chief.png`，显示“AI村长”。
- 参考资料连续追问会保持当前资料上下文，直到用户主动退出。
- **V0.5.0 新增 DOCX 全文解析与文档问答**：新上传 `.docx` 可解析为 `searchable_text`；旧 DOCX 可在治理端重新解析；已发布文档通过专用全文问答路径回答。
- 查询审计、参考数据浏览、源文件查看与 Excel / Word / PPT 结果导出保留。

## 项目结构

- `site/`：前端页面、样式、交互与 AI村长头像。
- `netlify/functions/api.mts`：主只读治理查询、参考数据、治理上传/发布 API。
- `netlify/functions/docx.mts`：V0.5.0 DOCX 解析与全文问答 API。
- `netlify/database/migrations/`：数据库结构、Demo 数据、数据治理与版本管理迁移。
- `data/demo-snapshot-v050/`：从当前公开演示站点分页完整抓取的系统内置 Demo 数据快照。
- `V043_CHANGELOG.md` ~ `V050_CHANGELOG.md`：版本演进记录。
- `DESIGN.md`：Civic AI Design System。

## 数据说明

仓库是公开仓库，因此只提交：

1. 可复现的**虚构 Demo 数据**；
2. 数据库结构和 migration；
3. 当前公开演示 API 的 `sys-*` Demo 数据快照。

不会提交管理员运行时上传的真实源文件、审计日志、访问记录、API Key、环境变量或其他私有数据。

`data/demo-snapshot-v050/manifest.json` 记录当前快照的数据集和行数；快照工作流会逐页抓取并校验 API `total`，避免只保存前 200 条。

## 部署

项目沿用现有 Netlify 项目：

```bash
npm install
netlify deploy --prod --build --debug
```

macOS 也可以双击 `deploy-macos.command`。

Netlify 运行时需继续使用现有环境变量，例如 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`HLK_MODEL`；密钥不得提交到 GitHub。

## 版本

当前版本：**V0.5.0**

V0.5.0 详细变更见 `V050_CHANGELOG.md`。
