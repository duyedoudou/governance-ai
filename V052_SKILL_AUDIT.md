# V0.5.2 查询 Skill 全量审计

## 结论

当前主要风险不是 SQL，而是自然语言到 SQL 之前的语义层：`queryFilters()` 与各领域分支使用正则/关键词提取极少数字段，并且在很多情况下会**静默忽略用户提出的其他约束**。这会导致“查询成功但答案错误”，比直接报错更危险。

当前大模型主要在数据库执行完成后负责总结结果，并没有承担完整的查询条件理解。因此 UI 显示 GPT-4.1-mini 并不能防止规则解析器误判。

推荐架构：

`自然语言 → 意图路由 → LLM 生成受约束 QuerySpec → Schema/权限/字段/操作符/Join 校验 → 参数化 SQL 编译 → 执行 → 结果校验 → LLM 表达`

禁止：
- 自然语言直接用宽泛正则猜字段；
- LLM 直接自由生成 SQL；
- 不支持的条件被静默丢弃；
- 查询 0 条时自动回退为全表；
- Trace 只展示 asset_id 而不展示实际生效条件。

## 当前 Skill 审计

| Skill / 路径 | 当前真正支持 | 已发现的高风险问题 | 风险 |
|---|---|---|---|
| `person_filter` | 年龄下限、村组、姓名精确匹配 | 姓名正则会把“岁以上的”等普通短语当姓名；不支持性别、年龄上限/区间、出生日期、家庭ID/地址、特殊标签、风险标签；这些条件会被静默忽略 | 严重 |
| `sys-households` | 仅参考数据浏览 | 当前 `runBuiltinQuery()` 没有家庭户专用查询分支，锁定家庭户资料后很多问题会落入人口查询 | 严重 |
| `pension_query` | 年度、未缴/已缴、姓名 | 村组虽被解析但未应用；缴费档次、实缴金额、缴费日期、补贴金额均不支持；姓名正则误伤同样存在 | 严重 |
| `welfare_query` | 关爱事项有限枚举、村组 | 姓名、年龄、性别、状态、开始/结束日期、备注全部无法组合；例如“3组70岁以上独居老人”年龄会被忽略 | 严重 |
| `emergency_query` | 最近一次台风、最低年龄 | 村组、姓名、指定事件、转移时间、安置地点、原因、状态、返回时间不支持；组合条件被静默丢弃 | 严重 |
| `emergency_expense_query` | 最近一次台风；最后统计“已核验”金额 | 费用类别、日期、金额比较、核验状态过滤、指定事件几乎都不支持；“金额>1000且未核验”仍可能返回全量费用并统计已核验金额 | 严重 |
| `policy_search` | 将问题切 token，在标题/摘要/适用对象中 OR 模糊搜索 | 不是字段级查询；政策领域、发布日期、生效日期、状态等不能可靠组合；OR 检索容易扩大结果 | 高 |
| `reference_dataset_query`（管理员上传结构化资料） | 对整行 JSON 做关键词包含搜索 | 没有字段、类型、比较操作符、AND/OR 语义；最危险的是：关键词过滤为 0 条时会回退为原始全表，可能把“不匹配”显示成“全部匹配” | 极严重 |
| `docx_fulltext_query` | DOCX 全文或相关片段检索后由模型依据正文回答 | 不属于 SQL 字段组合问题；长文档的关键词片段选择可能漏召回，但不会像结构化查询那样编译错误 SQL | 中 |
| `intent-router` | chat / system_help / governance_query / document_query / clarify | 只判断是否进入工作查询，不负责完整字段约束；不能替代 QuerySpec 语义层 | 中 |
| Agent Trace | 展示 tool 与部分 asset_id | 不展示真正生效的年龄、姓名、村组等参数，也不展示被丢弃的约束，因此无法从 Trace 发现“查询条件少了/错了” | 严重 |

## 已确认的组合错误样例

1. `70岁以上的人数`：年龄 >= 70 正确提取，但姓名规则可把“岁以上”误识别为姓名，最终得到 0。
2. `70岁以上女性`：年龄可能生效，性别被静默忽略。
3. `2组70岁以上女性`：年龄、村组生效，性别被忽略。
4. `2026年2组未缴养老保险`：年度、未缴生效，村组被忽略。
5. `实缴金额大于500元的已缴人员`：金额比较不支持。
6. `3组70岁以上独居老人`：关爱事项和村组生效，年龄被忽略。
7. `最近一次台风2组80岁以上转移人员`：最近事件、年龄生效，村组被忽略。
8. `应急费用金额大于1000且未核验`：金额与未核验过滤均不可靠，甚至会统计已核验金额。
9. `2026年生效的养老政策`：当前是关键词 OR 检索，不是“生效日期 + 政策领域”的结构化 AND 查询。
10. 管理员上传表 `年龄>70且性别=女`：当前 generic query 不理解字段比较与 AND；无匹配时还可能回退成全表。

## 必须建立的 QuerySpec

示例：

```json
{
  "intent": "aggregate",
  "dataset": "people",
  "select": [],
  "filters": [
    {"field": "age", "op": ">=", "value": 70},
    {"field": "gender", "op": "=", "value": "女"},
    {"field": "village_group", "op": "=", "value": "2组"}
  ],
  "joins": [],
  "aggregate": {"op": "count_distinct", "field": "person_id"}
}
```

跨表例子：

```json
{
  "intent": "aggregate",
  "dataset": "people",
  "filters": [
    {"field": "people.age", "op": ">=", "value": 70},
    {"field": "people.gender", "op": "=", "value": "女"},
    {"field": "welfare.welfare_type", "op": "=", "value": "最低生活保障"}
  ],
  "joins": [
    {"dataset": "welfare", "relation": "people.person_id = welfare.person_id"}
  ],
  "aggregate": {"op": "count_distinct", "field": "people.person_id"}
}
```

LLM 只能输出该 JSON DSL，不允许输出自由 SQL。后端必须依据字段注册表验证：字段存在、类型匹配、操作符合法、Join 在白名单内、用户有权限。

## Constraint Completeness（约束完整性）

这是下一版最重要的安全不变量：

> 用户问题中识别出的每一个实质性约束，要么进入 `effective_filters`，要么明确返回“该条件当前无法可靠执行”；绝不允许静默丢弃。

例如用户问“2组70岁以上女性”，系统解析出三个约束：`村组=2组`、`年龄>=70`、`性别=女`。如果执行计划只有两个，validator 必须拒绝执行，而不是返回一个看起来正常的数字。

## Trace 必须改造

管理员 Trace 至少要展示：

```json
{
  "tool": "structured_query",
  "dataset": "sys-people",
  "effective_filters": [
    {"field":"年龄","op":">=","value":70},
    {"field":"性别","op":"=","value":"女"}
  ],
  "joins": [],
  "aggregate": {"op":"count_distinct","field":"人员ID"},
  "result_count": 18
}
```

还应保存 `recognized_constraints` 与 `effective_filters`，二者不一致则查询失败并要求澄清。

## 测试策略

不能靠列举几个正则样例。每张表要根据字段元数据自动生成组合测试：
- 单字段：每个字段 × 合法操作符；
- 双字段 pairwise；
- 三字段常见组合；
- 跨表 Join；
- 同字段范围（>= 与 <=）；
- AND / OR / NOT；
- 中文同义表达；
- 0 条结果必须保持 0，绝不回退全表；
- 任一约束未编译时必须 fail closed。

## V0.5.2 建议范围

1. 删除 `queryFilters()` 作为治理查询的核心语义解析器。
2. 新增 schema registry / relation registry / QuerySpec JSON Schema。
3. 大模型只生成 QuerySpec。
4. 后端 validator 做约束完整性、字段类型、操作符和 Join 白名单检查。
5. QuerySpec 编译为参数化 SQL。
6. 所有内置表和管理员上传结构化表统一走这一套结构化查询引擎。
7. DOCX 保持独立文档问答链路。
8. Trace 展示真实 QuerySpec、有效过滤条件、结果数量和被拒绝原因。
9. 增加自动组合回归测试，覆盖所有字段及主要跨表关系。
