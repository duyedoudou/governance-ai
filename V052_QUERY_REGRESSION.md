# V0.5.2 组合查询回归矩阵

目标：任何字段的任意合法组合，都必须满足“全部执行或拒绝执行”，禁止静默丢条件。

## 人口 / 家庭

- `70岁以上的人数` → `age >= 70`，不得产生姓名条件。
- `2组70岁以上女性人数` → `village_group=2组 AND age>=70 AND gender=女`。
- `65到80岁的女性名单` → `age between 65,80 AND gender=女`。
- `2组或3组的独居人员` → `village_group in [2组,3组] AND special_tags contains 独居`。
- `风险标签包含需协助、年龄60岁以上` → 两个条件同时生效。
- `H0001家庭有哪些成员` → 使用 `household_members`，按 `household_id` 过滤。
- `高风险砖混结构家庭户数` → 使用 `households`，风险等级与房屋结构同时生效。

## 养老保险

- `2026年未缴人数` → `year=2026 AND payment_status=未缴`，人数使用人员去重。
- `2026年2组未缴女性名单` → 年度、村组、缴费状态、性别全部进入计划。
- `实缴金额500元以上的记录` → `paid_amount>=500`。
- `补贴金额100元以上且实缴金额500元以下` → 两个金额条件同时生效。
- `参保状态正常的70岁以上人员` → 使用 `pension_accounts`，参保状态与年龄同时生效。
- `待遇状态为领取中的女性` → 使用 `pension_accounts`。

## 民政与关爱

- `2组70岁以上独居老人` → 村组、年龄、关爱事项/独居语义全部进入计划。
- `2026年开始的临时救助记录` → 关爱事项 + 开始日期。
- `状态为有效的女性名单` → 状态 + 性别。
- `结束日期为空的低保记录` → 关爱事项 + `end_date is_null`。

## 应急转移 / 事件 / 干部

- `80岁以上转移人员名单` → `age_at_event>=80`。
- `2组80岁以上女性转移人员` → 村组、当时年龄、性别全部生效。
- `安置地点包含文化礼堂的记录` → shelter contains。
- `转移状态为已返回的人员` → status 条件。
- `响应等级为Ⅱ级的事件` → events.response_level。
- `任务角色为联络员的干部` → event_cadres.task_role。
- `责任区域包含2组的干部` → cadres/event_cadres responsibility_area。

## 应急费用

- `金额1000元以上的费用` → amount>=1000。
- `未核验且金额1000元以上` → verification_status + amount。
- `物资类且2026-08-01以后发生的费用` → category + expense_date。
- `已核验费用总额` → verification_status=已核验 + sum(amount)。

## 政策

- `养老领域且2026年以后生效的政策` → domain + effective_date。
- `状态有效且适用对象包含老年人的政策` → status + applicable_to contains。
- `关键条款包含补贴的文件` → clauses contains。

## 管理员上传结构化资料

- Planner 只能使用目录中的真实 `asset_id`。
- 字段名只能来自该资料的 `fields`。
- 数字字段支持比较与区间。
- 日期字段支持比较与区间。
- 文本字段支持等于、包含、不包含、in。
- 如果模型选择了不存在的字段，Schema Validator 必须拒绝执行。
- 如果用户说了三个约束而 QuerySpec 只有两个，Constraint Completeness 必须拒绝执行。
- 关键词没有匹配结果时不得回退成“整张表”。

## 失败策略

下列情况一律不查数据库：

- 模型无法生成合法 QuerySpec。
- 字段不存在。
- 操作符与字段类型不兼容。
- 用户约束被遗漏。
- QuerySpec 添加了用户没说的条件。
- 条件存在歧义。
- 当前数据结构无法表达用户要求。

原则：宁可要求确认，也不返回一个看起来正式但条件不完整的数字。