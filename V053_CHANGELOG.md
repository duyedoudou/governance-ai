# V0.5.3 变更记录：Agent Planner + 全局知识检索

## 目标

V0.5.2 解决“结构化数据怎么查准”；V0.5.3 解决“AI 如何决定去哪里找，以及资料越来越多后怎么找全、找准、融合正确”。

## 1. 路由从强分类改为能力选择

旧入口会强制把问题分进 chat / system_help / governance_query / document_query / clarify。V0.5.3 只在非常明确的闲聊与系统使用问题上做快速短路；其余问题统一进入 Agent Planner。

Agent Planner 不再回答“这句话属于哪个桶”，而是回答“完成这个目标需要哪些能力”：

- structured_query：V0.5.2 QuerySpec 受控结构化查询
- knowledge_search：全局已发布资料检索
- general_response：不依赖村级事实的一般讨论
- system_help：系统使用帮助
- clarify：确实缺少必要信息时再澄清

如果结构化查询无法可靠映射数据集，Agent 会自动尝试 knowledge_search，不再把 `unknown dataset / unresolved` 直接暴露给用户。

## 2. 全局知识索引

新增 migration `006_knowledge-retrieval`：

- `knowledge_chunks`：文档/结构化资料的检索片段
- `knowledge_index_state`：每份资料的索引状态
- `search_tokens` 使用 GIN 数组索引，兼容中文二/三元片段关键词检索
- `embedding` 为可选 double precision[]，用于语义相似度

不修改任何已经应用过的旧 migration。

## 3. Hybrid Search

`knowledge-core.mts` 实现：

- 查询语义扩展：模型生成近义词、上下位词和村级资料常见表达
- 中文关键词召回：标题、分类、说明、字段、正文与 chunk tokens
- 可选 Embedding：通过 OpenAI 兼容 `/v1/embeddings` 接口；若当前网关不支持会自动降级，不阻断检索
- 语义重排序：对候选片段由模型按“能否回答问题”重新评分
- 每份资料限制召回片段数，避免单文件淹没其他来源
- 先索引与当前问题相关的未索引资料，再补少量最近资料，避免知识库变大后每次全量重建

## 4. 多资料融合

`knowledge_search` 找到多份资料后：

- 按 asset 分组
- 同义信息由融合模型去重
- 互补信息合并
- 数字/人数/金额/时间保持原值
- 资料口径冲突显式输出 conflicts，不平均、不擅自选一个
- 较新资料若有明确时间证据，可以说明“较新资料记录为…”，但旧来源仍保留
- 结构化资料中的明确统计优先作为数值事实，文档主要作为背景解释

## 5. 增量索引

全局检索会比较资料 `updated_at` 与 `knowledge_index_state.source_updated_at`。DOCX 重新解析、结构化资料更新或新资料发布后，首次相关检索会自动建立/刷新对应 knowledge chunks；不需要重建整个知识库。

## 6. Agent Trace

执行过程新增：

- Agent Planner 选择的能力
- 查询扩展词
- 是否使用 embedding
- 是否使用 rerank
- 候选 chunk 数
- 命中 chunk 数 / 资料数
- 本次自动索引了哪些资料
- 若调用 QuerySpec，保留 V0.5.2 的 recognized_constraints / effective_filters / 参数化执行 trace

## 7. 用户层错误收口

没有资料时返回友好 data gap，不再把 `unknown dataset`、`unresolved` 等内部规划错误作为主要回答；内部细节仅保留在“执行过程”。

## 已知边界

1. Embedding 依赖当前 OpenAI 兼容网关是否支持 `/v1/embeddings` 与配置的 embedding 模型；若不可用，仍使用“语义查询扩展 + 关键词召回 + LLM rerank”。
2. 当前 embedding 相似度在 Function 内对受控数量的 chunk 计算，适合当前村级知识库规模；若后续达到几十万/百万 chunk，应升级为数据库原生向量索引或独立向量检索服务。
3. PDF 扫描件仍需要后续 OCR/文本解析能力才能进入全文知识索引。
