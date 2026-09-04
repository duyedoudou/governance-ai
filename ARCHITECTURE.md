# 黄林坑村治理智能助手 V0.4.5 架构

## 用户侧：Read-only AI
浏览器 → `/api/query` → GPT Query Planner → Plan Validator → 受控 Skill → Netlify Database/Postgres → 结果 UI。

用户侧没有上传、修改、删除、回写入口。

## 参考数据
「更多 → 参考数据」从数据库动态读取分类：
`reference_categories → data_assets → data_asset_records / source blob`。

工作人员可逐层进入分类、数据集/文件、原始记录；上传源文件可通过受控 source endpoint 查看。

## 数据治理端
管理员入口：
上传已清洗文件 → Netlify Function 解析 → GPT/规则建议分类 → 待确认 → 人工确认发布 → 新分类自动建文件夹 → AI 动态目录刷新。

### 存储职责
- Netlify Blobs：保存上传的原始源文件。
- Postgres `data_assets`：文件/数据集元数据、分类、状态、版本、字段。
- Postgres `data_asset_records`：结构化文件解析后的 JSONB 行。
- Postgres `reference_categories`：参考数据动态分类文件夹。

## AI 动态资料 Skill
`reference_dataset_query` 只允许访问 `status='published'` 且 AI 可读取的数据资产。
待确认上传、未发布资料、仅归档但无全文解析的 PDF/Word 不会进入模型动态数据目录。
