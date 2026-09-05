# V0.5.3.4 — Semantic Tool Gate

## 修复目标

修复普通自然语言（例如“介绍你自己”）被固定词表漏判后误送入 Agent，最终触发失败兜底的问题。

## 核心修改

- 删除 Edge Router 中的固定闲聊词表、自我介绍词表和相关正则枚举。
- 新增语义 Tool Gate：只判断“回答是否必须读取村级数据库/已发布资料/当前锁定资料”。
- Gate 输出仅有 `conversation / system_help / tool` 三种行为级结果，不再维护不断扩张的提问句式列表。
- 默认策略改为：不确定时优先 `conversation`，不为了保险而查询数据库。
- `conversation` 直接进入普通对话；禁止编造黄林坑村具体天气、人员、数字、村务进展。
- `system_help` 依据内置系统使用事实回答。
- 仅 `tool` 才进入 Agent Planner，再由 Agent 决定 `structured_query / knowledge_search / general_response / clarify` 等能力。
- Agent 继续采用延迟数据库初始化；一般回答在数据库初始化之前即可完成。
- 保留 V0.5.2 QuerySpec、people_governance、V0.5.3 Hybrid Knowledge Search、DOCX 和数据治理能力。

## 回归保护

CI 明确断言：

- Edge Router 必须存在 `semanticRoute` 和 `semantic-tool-gate`。
- 不允许重新出现 `isSelfIntro / isDirectChat / selfIntroResponse` 等枚举式路由。
- 不允许把“介绍你自己”“来聊天”等具体问法写进路由源码作为白名单。
- 一般回答路径必须位于数据库初始化之前。
- AI村长主头像和独立备用头像必须同时存在。

## 版本

状态接口版本：`0.5.3.4`
