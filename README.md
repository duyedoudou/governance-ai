# 黄林坑村治理智能助手 V0.5.1

这是当前到 **V0.5.1** 的主代码仓库。`main` 分支作为唯一当前版本，不再依赖历史 `.bootstrap` 恢复包。

## 当前能力

- 自然语言查询人口与家庭、养老保险、民政与关爱、应急防灾、政策文件等已发布治理数据。
- **V0.5.1 新增对话意图路由**：先区分闲聊、系统使用问题、治理查询、文档查询和意图不清，再决定是否调用数据；无法识别时不再默认查询人口台账。
- 闲聊模式不会查询治理数据库，前端明确显示“闲聊 · 未查询数据库”。
- 系统使用问题（如上传、删除、发布、导出、查看依据）由系统帮助直接回答，不查询村民数据。
- 参考数据使用稳定 `asset_id`，避免中文资料标题与 `asset_id` 混用造成“库里有数据却查不到”。
- 管理员数据治理：上传、自动分类、人工确认发布、数据集版本管理、删除上传资料与 current version 回退。
- 管理员入口同时适配桌面端和移动端。
- AI 回答头像使用 `site/assets/ai-village-chief.png`，显示“AI村长”。
- 参考资料连续追问会保持当前资料上下文，直到用户主动退出；闲聊表达可以临时切出工作模式。
- DOCX 全文解析与文档问答：新上传 `.docx` 可解析为 `searchable_text`；旧 DOCX 可在治理端重新解析；已发布文档通过专用全文问答路径回答。
- 查询审计、参考数据浏览、源文件查看与 Excel / Word / PPT 结果导出保留。

## 项目结构

- `site/`：前端页面、样式、交互、AI村长头像和 V0.5.1 闲聊 UI。
- `site/intent-ui.js`：闲聊 / 使用帮助 / 意图确认的轻量展示层。
- `netlify/functions/api.mts`：主只读治理查询、参考数据、治理上传/发布 API。
- `netlify/functions/docx.mts`：DOCX 解析、全文问答和上传资料删除 API。
- `netlify/edge-functions/intent-router.ts`：V0.5.1 闲聊 / 工作意图路由层。
- `netlify/database/migrations/`：数据库结构、Demo 数据、数据治理与版本管理迁移。
- `data/demo-snapshot-v050/`：从当前公开演示站点分页完整抓取的系统内置 Demo 数据快照。
- `V043_CHANGELOG.md` ~ `V051_CHANGELOG.md`：版本演进记录。
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

macOS 推荐直接双击 `deploy-macos.command`。部署脚本会先同步 production migration 历史，再 build 和发布，避免旧 migration checksum 冲突。

Netlify 运行时需继续使用现有环境变量，例如 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`HLK_MODEL`；密钥不得提交到 GitHub。

## 版本

当前版本：**V0.5.1**

V0.5.1 详细变更见 `V051_CHANGELOG.md`。
