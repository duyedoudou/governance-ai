# 黄林坑村治理智能助手 V0.5.3.4

这是当前 **V0.5.3.4** 主代码仓库。`main` 分支作为唯一当前版本，包含语义 Tool Gate、Agent Planner、V0.5.2 QuerySpec、V0.5.3 全局知识检索、DOCX 文档问答和管理员数据治理能力。

## 当前能力

- 自然语言查询人口与家庭、养老保险、民政关爱、应急防灾、政策文件等已发布治理数据。
- **V0.5.3.4 语义 Tool Gate**：不再靠固定提问词、正则白名单判断聊天或工作问题；只判断可靠回答是否必须读取村级数据库、已发布资料或当前锁定资料。
- `conversation / system_help / tool` 三类行为级路由；不确定时优先普通对话，不为了保险而乱查数据库。
- **V0.5.2 QuerySpec**：模型只生成受约束的查询计划，系统校验字段、类型、操作符和聚合后编译为参数化 SQL；数据库负责最终人数、名单和金额计算。
- `people_governance` 跨域人员视图，用于人口、家庭、养老、民政、应急等组合筛选。
- **V0.5.3 Hybrid Knowledge Search**：对已发布资料进行分块、语义扩展、关键词/向量候选融合、重排、多来源综合，并保留来源证据。
- DOCX 全文解析和文档问答；管理员上传资料后需确认发布才进入 AI 可查询范围。
- 参考数据使用稳定 `asset_id`，避免资料标题与 `asset_id` 混用导致“库里有数据却查不到”。
- 管理员数据治理：上传、自动分类、人工确认发布、版本管理、删除管理员上传资料。
- AI 回答头像使用 `site/assets/ai-village-chief.png`，显示“AI村长”，并保留独立备用头像。
- 查询审计、参考数据浏览、依据查看、执行过程、Excel / Word / PPT 导出保留。

## 核心原则

**数据库负责算，文档负责解释，大模型负责组织。**

- 人数、名单、金额等事实计算由数据库执行，不由模型心算。
- 文档用于政策、背景、产业、活动和情况说明。
- 大模型负责理解用户目标、选择能力和组织最终回答。
- 没有可核验依据时，不编造黄林坑村具体事实。

## 项目结构

- `site/`：前端页面、样式、交互和 AI村长头像。
- `netlify/edge-functions/intent-router.ts`：V0.5.3.4 语义 Tool Gate。
- `netlify/functions/agent-v053.mts`：Agent Planner 与能力编排。
- `netlify/functions/structured-query.mts`：V0.5.2 QuerySpec 结构化查询执行。
- `netlify/functions/knowledge.mts`：知识索引、重建和检索 API。
- `netlify/lib/knowledge-core.mts`：知识分块、检索、重排与多来源融合。
- `netlify/functions/api.mts`：主只读治理查询、参考数据、治理上传/发布 API。
- `netlify/functions/docx.mts`：DOCX 解析、全文问答和上传资料删除 API。
- `netlify/database/migrations/`：数据库结构、Demo 数据、数据治理、版本管理与知识检索迁移。
- `V052_CHANGELOG.md`、`V053_CHANGELOG.md`、`V0534_CHANGELOG.md`：当前核心架构演进记录。
- `DESIGN.md`：Civic AI Design System。

## 数据说明

仓库是公开仓库，因此只提交：

1. 可复现的虚构 Demo 数据；
2. 数据库结构和 migration；
3. 当前公开演示用的 `sys-*` Demo 数据快照；
4. 前后端源码、测试和部署脚本。

不会提交管理员运行时上传的真实源文件、真实村民数据、审计日志、访问记录、API Key、环境变量或其他私有数据。

## 部署

当前源码仍保留 Netlify 部署结构：

```bash
npm install
netlify deploy --prod --build --debug
```

macOS 可运行 `deploy-macos.command`。脚本会先对齐 production migration 历史，再 build 和发布，避免修改已执行 migration 导致 checksum 冲突。

当前代码使用 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`HLK_MODEL` 作为模型网关配置；密钥和运行时配置不得提交到 GitHub。

## 版本

当前源码版本：**V0.5.3.4**

详细变更见 `V0534_CHANGELOG.md`。
