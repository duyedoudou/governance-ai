# V0.4.2 部署修复

本版修复 Netlify 422：`Incorrect function names`。

原因：`netlify/functions/types.d.ts` 被 Netlify 扫描为函数入口，解析出的函数名包含 `.`，不符合只允许字母、数字、连字符和下划线的规则。

修复：
- 删除 `netlify/functions/types.d.ts`；Functions 目录只保留 `api.mts`。
- 部署脚本会自动删除 `.d.ts`、`.DS_Store`、`._*` 等非函数文件。
- 部署前主动校验 Function 入口名称。
- 将数据库迁移目录 `002_seed_demo` 改为 `002_seed-demo`。
