# V0.4.7 查询路由修复

## 修复问题

当用户以自然语言引用“人口基础台账”等系统内置参考资料时，模型可能错误地把资料标题直接当成 `asset_id`，例如 `asset_id=人口基础台账`，从而误报“参考数据不可用”。

## 本版修复

1. 在 Query Plan Validator 中识别人口基础台账/人口台账/人口与家庭/村民基础名册等系统内置别名。
2. 对这类查询强制改写为确定性 `person_filter`，例如“70岁以上”自动提取 `min_age=70`，并返回明细。
3. Planner Prompt 明确：系统内置人口、养老、民政、应急数据必须使用专用 Skill，`reference_dataset_query` 只处理数据治理端额外上传并发布的数据。
4. 通用参考资料查询器增加标题/源文件名解析兜底：即使模型传了标题，也会尝试解析真实 `asset_id`，避免假性 data gap。
5. 动态参考资料目录明确向模型暴露真实 `asset_id`，并提醒不得用标题替代。

## 目标行为

用户问：

> 基于参考数据“人口基础台账”，把70岁以上的调出来，我看一下

应生成/校验为：

```json
{
  "tool": "person_filter",
  "params": {
    "min_age": 70,
    "detail": true
  }
}
```

而不是：

```json
{
  "tool": "reference_dataset_query",
  "params": {
    "asset_id": "人口基础台账"
  }
}
```
