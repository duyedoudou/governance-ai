# V0.5.3 自查

- TypeScript 静态检查：通过（knowledge-core / knowledge / agent-v053 / intent-router）
- migration：只新增 006，不修改 001-005
- 闲聊快捷路由：只保留明确固定表达，不再使用治理关键词分类
- 普通工作问题：统一进入 Agent Planner
- 结构化计算：继续委托 V0.5.2 QuerySpec 内核
- 结构化规划失败：自动 fallback 到 knowledge_search
- knowledge_search：相关资料索引 → 查询扩展 → 关键词召回 → 可选 embedding → rerank → 多源融合
- 多源融合：冲突不得静默覆盖
- DOCX/结构化资料更新后：首次相关 knowledge_search 根据 updated_at 自动刷新索引
- 没有资料：友好 data_gap，不暴露 unresolved

## 部署后重点验收

1. “蜂蜜生产情况”不应直接进入未知结构化 dataset；如果库中有蜂蜜相关资料，应返回多源检索结果。
2. “70岁以上有多少人”仍应走 structured_query，并保持 V0.5.2 的约束完整性。
3. “蜂蜜和乡村治理有什么关系”在没有要求黄林坑具体事实时，应允许一般讨论，不查村民数据库。
4. 多份资料均提及蜂蜜时，“查看依据”应出现多份来源；“执行过程”显示 matched_assets / matched_chunks。
5. 两份资料数字不一致时，应出现 conflicts，而不是任选一个数字。
