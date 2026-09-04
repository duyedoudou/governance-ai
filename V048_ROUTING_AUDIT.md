# V0.4.8 全表查询路由自查

本轮不是只修“人口基础台账”，而是对参考数据中全部系统内置资料做统一查询路由自查。

## 已检查的 7 个系统内置资料

1. `sys-people` — 人口基础台账
2. `sys-households` — 家庭户台账
3. `sys-pension` — 养老保险缴费台账
4. `sys-welfare` — 民政与关爱台账
5. `sys-evacuations` — 应急转移安置台账
6. `sys-expenses` — 应急费用台账
7. `sys-policies` — 政策文件库

## 本轮发现的问题

### 1. 中文标题与 asset_id 混用
此前 `reference_dataset_query` 只认识治理端上传资料，系统内置资料虽然能在“参考数据”中浏览，但其中文标题不能直接作为 `asset_id` 查询。模型一旦输出 `asset_id=人口基础台账` 等值，就会误报资料不存在。

### 2. 只对人口台账做了单点修复
V0.4.7 只识别“人口基础台账”一组别名，家庭、养老、民政、应急、费用、政策仍可能出现同类问题。

### 3. 从参考数据页面发起问答仍依赖标题猜测
此前点击“基于此资料问 AI”只把中文标题写进输入框，没有把真实 `asset_id` 结构化传给后端。

### 4. 民政政策领域名称不一致
规划层可能使用“民政与关爱”，而政策表中的真实领域为“民政救助”，可能造成政策查询为空。

### 5. 应急费用 / 转移台账的专用路由条件过宽
资料标题本身含“费用”“转移”，可能导致普通表内筛选被误路由成“最近一次台风”。

## V0.4.8 修复

- 为 7 个系统内置资料建立统一固定 ID + 别名解析表。
- `reference_dataset_query` 现在同时支持系统内置 `sys-*` 资料与治理端上传资料。
- 所有系统内置字段建立英文/内部字段名到界面中文字段名的映射。
- 从“参考数据”页面点击“基于此资料问 AI”时，前端会隐藏传递真实 `asset_id`、标题、分类和 system 标记。
- 后端把结构化 `reference_context` 的优先级设置为高于模型对标题的猜测。
- 治理端上传资料仍优先使用真实 `asset_id`；若模型误传标题，则按标题/源文件名唯一反查；模糊命中多份时明确提示候选，不猜。
- 内置资料在适合的情况下仍优先走专用 Skill：人口→`person_filter`，养老→`pension_stats/person_filter`，应急→`emergency_event`，政策→`policy_search`；其余原始表筛选可走通用参考数据查询。
- 民政政策领域统一映射为数据库真实值“民政救助”。
- 收窄应急费用/转移的专用路由触发条件，普通金额、日期、状态筛选不再自动套用最近一次台风。
- 通用筛选增加日期比较、带千分位/货币符号的金额比较、对象/数组 contains 支持。

## 自动自测矩阵

以下场景已在本地纯路由测试通过：

- 人口基础台账 → 70岁以上 → `person_filter`
- 家庭户台账 → 高风险家庭 → `reference_dataset_query(sys-households)`
- 养老保险缴费台账 → 2026未缴 → `pension_stats`
- 养老保险缴费台账 → 实缴金额 > 1000 → `reference_dataset_query(sys-pension)`
- 民政与关爱台账 → 独居老人 → `person_filter`
- 民政与关爱台账 → 2026年开始的记录 → `reference_dataset_query(sys-welfare)`
- 应急转移安置台账 → 上一次台风80岁以上 → `emergency_event`
- 应急转移安置台账 → 2025年原始记录 → `reference_dataset_query(sys-evacuations)`
- 应急费用台账 → 上次台风花多少钱 → `emergency_event(focus=expenses)`
- 应急费用台账 → 金额 > 1000 → `reference_dataset_query(sys-expenses)`
- 政策文件库 → 养老保险怎么规定 → `policy_search`
- 参考数据页面结构化上下文 → 精确锁定真实 `asset_id`

另外使用 mock DB 对 7 个系统内置资料逐一执行通用筛选，均可由中文标题解析到对应真实数据集并返回记录。
