# V0.5.2 Changelog — 结构化查询内核

## 为什么要改

V0.5.1 之前的结构化数据查询采用“自然语言 → 手写正则/关键词 → SQL”的方式。它能快速覆盖少量固定问题，但字段和组合一多，就会出现两个高风险问题：

1. 正则误识别，例如“70岁以上的人数”中的“岁以上”被误判为姓名。
2. 条件静默丢失，例如用户同时说年龄、性别、村组，旧 Skill 可能只执行其中一部分，却仍返回一个正式数字。

V0.5.2 不再给旧 `queryFilters()` 增加补丁，而是增加新的结构化查询内核。

## 新链路

```text
用户自然语言
→ 意图路由
→ LLM 生成受控 QuerySpec（不写 SQL）
→ Schema / 字段 / 类型 / 操作符校验
→ Constraint Completeness 二次语义审计
→ 参数化 SQL（系统内置关系数据）或受控字段过滤（管理员上传结构化资料）
→ 数据库/确定性引擎计算
→ LLM 只解释已执行结果
```

## QuerySpec

QuerySpec 只能使用白名单数据集、字段和操作符。

支持操作符：

- `eq` / `neq`
- `gt` / `gte` / `lt` / `lte`
- `between`
- `in`
- `contains` / `not_contains`
- `is_null` / `not_null`

支持聚合：

- `count`
- `count_distinct`
- `sum`
- `avg`
- `min`
- `max`

## Constraint Completeness

新增第二次模型审计，专门比较“用户原话”和“QuerySpec”：

- `missing_constraints`：用户说了但计划没有表达的条件。
- `extra_constraints`：计划凭空增加的条件。
- `ambiguous_constraints`：多义、字段映射不唯一或比较方向不明确。

只要任意一项不为空，本次数据库查询就不会执行。系统会要求用户确认，而不是给一个可能错误的数字。

## Schema Registry

当前结构化查询内核注册以下逻辑数据集：

- `people`：人口基础台账
- `households`：家庭户台账
- `household_members`：家庭成员关系
- `pension`：养老保险缴费
- `pension_accounts`：养老保险账户/参保/待遇
- `welfare`：民政与关爱
- `evacuations`：人员转移安置
- `events`：应急事件
- `cadres`：村干部
- `event_cadres`：事件干部参与
- `expenses`：应急费用
- `policies`：政策文件

同时支持管理员发布的结构化资料。Planner 只能使用目录返回的真实 `asset_id`，不允许把资料标题冒充 `asset_id`。

## Trace

“执行过程”现在由真实执行计划生成，包含：

- `recognized_constraints`
- `effective_filters`
- `aggregate`
- `group_by`
- `select`
- `sort`
- `execution.engine`
- 参数化 SQL 与参数（系统内置关系数据）
- source asset id
- `query_spec`
- `constraint_audit`

因此 Trace 不再只显示 `asset_id`，而能看到实际生效条件。

## 安全边界

- 大模型不直接写 SQL。
- 数据集、字段、表达式全部来自服务端白名单 Schema。
- 用户值只作为 SQL 参数，不拼入 SQL 结构。
- 模型生成的聚合别名不会成为 SQL 标识符。
- 条件无法完整映射时拒绝执行。
- 闲聊、系统帮助仍不访问治理数据库。
- DOCX 继续走独立的已发布正文查询链路。

## 数据库

V0.5.2 不新增数据库 migration，不修改现有生产数据。
## 跨域人员筛选

新增 `people_governance` 只读逻辑视图，用于人口 + 养老 + 民政/关爱 + 应急的人员级组合筛选。人员列表去重；聚合只允许 `count_distinct(person_id)`，金额聚合必须走单业务数据集，避免一对多 Join 放大。
