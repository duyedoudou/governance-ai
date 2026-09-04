---
name: Civic-AI-Design-System
version: 1.0.0
status: active
language: zh-CN
description: 面向公众的年轻化 AI 政务服务设计系统。采用极简科技产品结构，以政务蓝建立可信感，以充足留白和单一 AI 入口降低使用门槛。
inspiration:
  - Vercel: precise minimal structure
  - Apple: generous whitespace and restrained hierarchy
  - Mintlify: subtle AI and knowledge-product atmosphere
---

# Civic AI Design System

## 1. Design Intent

本系统用于面向公众的 AI 政务服务网站、智能咨询助手、材料助手和办事指引产品。

目标不是复刻传统政务门户，而是创建一个现代、可信、年轻、简单、好用的 AI 产品。政府属性主要通过政务蓝、清晰语言、信息安全和无障碍设计体现，而不是通过复杂栏目、宣传图片或传统视觉符号体现。

设计关键词：

- 简单：每个页面只突出一个主要任务。
- 年轻：使用现代排版、轻量组件和克制的 AI 氛围。
- 可信：颜色稳重、信息准确、状态明确、交互可预期。
- 好用：优先自然语言入口，减少用户寻找菜单的成本。
- 包容：兼顾长者、低数字素养用户和无障碍用户。

## 2. Non-Negotiable Principles

1. 首屏必须以 AI 对话入口作为唯一视觉中心。
2. 页面至少 50% 的可见区域应为留白或低干扰背景。
3. 一个页面最多只有一个高强调主操作。
4. 首屏核心能力入口最多三个。
5. 政务属性来自可信配色和服务体验，不使用陈旧门户结构。
6. 除非业务明确要求，不增加公告、新闻、统计图、数据表或服务宫格。
7. 装饰不能抢过内容；AI 氛围只能作为弱背景存在。
8. 所有关键流程必须提供明确的进行中、成功、警告和失败状态。

## 3. Visual Personality

整体感受应像一个由公共机构提供的优质 AI 产品：安静、直接、清晰、可靠。

- 视觉基底：Vercel 式精准极简。
- 空间节奏：Apple 式大留白和低密度。
- AI 氛围：Mintlify 式细网格、微光和知识工具感。
- 品牌表达：政府蓝色调，但避免传统门户的厚重、拥挤和行政化装饰。

## 4. Color Tokens

### Core Palette

| Token | Value | Usage |
| --- | --- | --- |
| `--color-primary` | `#1677FF` | 主按钮、输入框焦点、关键链接 |
| `--color-primary-hover` | `#0F62D6` | 主操作悬停状态 |
| `--color-primary-active` | `#0B4FAD` | 主操作按下状态 |
| `--color-primary-soft` | `#EAF3FF` | 淡蓝背景、选中状态、弱提示 |
| `--color-government-navy` | `#123B6D` | 主标题、品牌字、可信信息 |
| `--color-government-deep` | `#0B2748` | 高强调文字、深色模式背景 |
| `--color-cyan` | `#43B6E8` | 少量 AI 光效，不用于主要按钮 |
| `--color-canvas` | `#F8FAFD` | 页面背景 |
| `--color-surface` | `#FFFFFF` | 卡片、输入框、导航表面 |
| `--color-surface-soft` | `#F1F6FC` | 次级区域和悬停底色 |
| `--color-text` | `#0F2742` | 正文与高对比文字 |
| `--color-text-secondary` | `#52677D` | 说明文字 |
| `--color-text-muted` | `#7C8FA3` | 辅助信息、占位符 |
| `--color-border` | `#DCE7F5` | 默认边框 |
| `--color-border-strong` | `#AFC8E8` | 强调边框、输入框悬停 |
| `--color-success` | `#16875A` | 成功状态 |
| `--color-warning` | `#B7791F` | 警告与待补充状态 |
| `--color-error` | `#C43D4B` | 错误与危险状态 |

### Color Rules

- 页面 80% 以上应由白色、淡灰蓝和深色文字构成。
- 高饱和蓝只用于主操作、焦点和少量关键信息。
- 青色只能作为 AI 氛围辅助色，面积不得超过页面的 5%。
- 不使用大面积渐变。允许在 AI 输入区域背后使用低透明度蓝青微光。
- 不使用红色作为品牌色；红色仅用于错误或危险操作。
- 正文与背景的对比度至少达到 WCAG AA。

### Suggested CSS Variables

```css
:root {
  --color-primary: #1677ff;
  --color-primary-hover: #0f62d6;
  --color-primary-active: #0b4fad;
  --color-primary-soft: #eaf3ff;
  --color-government-navy: #123b6d;
  --color-government-deep: #0b2748;
  --color-cyan: #43b6e8;
  --color-canvas: #f8fafd;
  --color-surface: #ffffff;
  --color-surface-soft: #f1f6fc;
  --color-text: #0f2742;
  --color-text-secondary: #52677d;
  --color-text-muted: #7c8fa3;
  --color-border: #dce7f5;
  --color-border-strong: #afc8e8;
  --color-success: #16875a;
  --color-warning: #b7791f;
  --color-error: #c43d4b;
}
```

## 5. Typography

### Font Stack

```css
font-family: Inter, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
```

### Type Scale

| Role | Desktop | Mobile | Weight | Line height |
| --- | --- | --- | --- | --- |
| Hero | 56px | 36px | 600 | 1.12 |
| Section title | 32px | 26px | 600 | 1.25 |
| Card title | 20px | 18px | 600 | 1.35 |
| Lead text | 20px | 18px | 400 | 1.6 |
| Body | 16px | 16px | 400 | 1.65 |
| Small text | 14px | 14px | 400 | 1.55 |
| Button | 16px | 16px | 600 | 1 |

### Typography Rules

- 中文标题使用 600，不使用 800 或 900 的超粗字重。
- 正文字号不得低于 16px；辅助信息不得低于 14px。
- 主标题尽量控制在一行，最多两行。
- 每段说明文字尽量不超过 40 个汉字。
- 不使用全大写英文作为大面积装饰。
- 不使用衬线字体、书法字体或仿宋字体承担 UI 信息。

## 6. Spacing and Layout

### Spacing Scale

| Token | Value |
| --- | --- |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |
| `--space-9` | 96px |

### Page Geometry

- 最大内容宽度：1200px。
- 阅读型内容最大宽度：760px。
- 桌面端页面水平留白：32–48px。
- 移动端页面水平留白：20px。
- 导航高度：64px。
- 首屏主体与导航之间至少保留 80px。
- 区块之间使用 80–96px 间距。
- 卡片网格间距：20–24px。
- 不为了填满屏幕而添加内容。

## 7. Radius, Borders and Depth

| Element | Radius |
| --- | --- |
| Small control | 8px |
| Button | 10px |
| Standard card | 12px |
| AI input | 14px |
| Modal / large panel | 16px |
| Status pill | 9999px |

- 默认边框：`1px solid var(--color-border)`。
- 输入框悬停边框：`var(--color-border-strong)`。
- 输入框聚焦：2px 蓝色焦点环，不能只用阴影表达焦点。
- 卡片优先用边框和表面色建立层级。
- 阴影必须轻微：`0 12px 32px rgba(18, 59, 109, 0.08)`。
- 一个视口内不应出现超过两种阴影层级。
- 禁止强烈玻璃拟态、厚重投影和发光边框。

## 8. Core Page Composition

首页首屏应只包含以下内容：

1. 简洁导航：品牌、智能咨询、材料助手、办事指引。
2. 主标题：例如“让政务服务更简单”。
3. 一行解释：例如“直接说出你要办理的事情”。
4. 大型 AI 输入框，作为唯一主视觉和主要操作。
5. 三个能力卡片：智能咨询、材料助手、办事指引。
6. 一条简短信任信息：安全可信、隐私保护或信息来源说明。

首屏不得出现：

- 新闻和公告列表。
- 九宫格或多行服务入口。
- 数据看板、折线图、统计大屏。
- 左侧管理后台导航。
- 人物宣传照、领导照片、政府大楼或城市宣传图。
- 同时竞争注意力的多个主按钮。

## 9. Components

### 9.1 Top Navigation

- 高度 64px，白色或 92% 透明白色背景。
- 可使用 `backdrop-filter: blur(12px)`，但不得形成强烈玻璃感。
- 左侧为抽象、非官方的产品标记与“政务AI”。
- 右侧最多三个导航项。
- 导航文字 15–16px，默认使用深海军蓝。
- 移动端折叠为一个菜单按钮。

### 9.2 Hero

- 内容居中，宽度不超过 900px。
- 主标题与副标题之间使用 20–24px 间距。
- 主标题使用 `--color-government-navy`。
- 不使用营销化夸张表述，例如“颠覆”“革命性”“全球领先”。
- 背景保持安静，可以出现透明度低于 12% 的细网格或蓝青微光。

### 9.3 AI Prompt Input

- 桌面端宽度 720–920px，高度 72–84px。
- 移动端宽度 100%，最小高度 64px。
- 白色表面、14px 圆角、清晰边框。
- 占位文字使用自然语言，例如“请输入您想办理或咨询的事情”。
- 发送按钮位于右侧，使用主蓝色，触控尺寸不得小于 44px。
- 支持键盘操作、焦点状态、加载状态和语音入口时，语音入口必须为次级操作。
- 用户提交后，输入区域应自然转入对话状态，而不是跳转到复杂门户。

### 9.4 Capability Cards

- 数量固定为三个，桌面端一行排列，移动端纵向排列。
- 卡片只包含一个线性图标、标题和一行说明。
- 图标使用单色蓝线条，不使用多彩图标。
- 卡片默认白色背景和细边框。
- 悬停只允许轻微上移 2px、边框加深或背景转为淡蓝。
- 卡片不能包含统计数字、复杂按钮或多级链接。

### 9.5 Buttons

Primary：

- 背景 `--color-primary`，文字白色。
- 高度 44–48px，水平内边距 20–24px。
- 悬停使用 `--color-primary-hover`。
- 按下使用 `--color-primary-active`。

Secondary：

- 白色背景、深蓝文字、1px 边框。
- 不与主按钮使用相同视觉重量。

Tertiary：

- 无背景的文字操作，只在悬停时出现淡蓝底色。

### 9.6 Status and Trust

- 成功、警告和错误不能只依赖颜色，必须同时提供图标或文字。
- “安全可信”区域保持简短，不使用大段宣传。
- 隐私说明应靠近 AI 输入区或首次提交动作。
- 当 AI 回答存在不确定性时，应明确提示信息来源和人工咨询入口。

## 10. Icons and AI Atmosphere

- 使用 1.5–2px 描边的现代线性图标。
- 图标尺寸以 20px、24px、32px 为主。
- 同一页面只使用一种图标风格。
- 不使用 3D 图标、多彩拟物图标或卡通机器人。
- AI 氛围可以通过以下方式体现：
  - 输入框旁一个四角星或抽象光点。
  - 背景中极淡的点阵或透视网格。
  - 提交和生成状态中的轻微蓝色流动动画。
- AI 装饰面积不得超过首屏的 15%，透明度通常不超过 12%。

## 11. Motion

- 动效时长：快速反馈 120–160ms，普通过渡 180–240ms。
- 缓动：`cubic-bezier(0.2, 0.8, 0.2, 1)`。
- 卡片悬停最多上移 2px。
- AI 生成状态使用柔和脉冲或逐字出现，不使用持续旋转的大型装饰。
- 尊重 `prefers-reduced-motion`，关闭非必要动画。

## 12. Responsive Behavior

### Breakpoints

- Desktop: `>= 1200px`
- Laptop: `>= 992px`
- Tablet: `>= 768px`
- Mobile: `< 768px`

### Mobile Rules

- 主标题缩小至 34–38px。
- 能力卡片由三列变为单列。
- AI 输入框保持完整宽度，发送按钮触控面积至少 44×44px。
- 导航收起，但 AI 主入口不能隐藏在菜单中。
- 不通过缩小字体强行保留桌面布局。
- 不出现横向滚动。

## 13. Accessibility

- 文本与背景对比度至少达到 WCAG AA。
- 所有交互元素必须支持键盘操作。
- 使用清晰可见的 `:focus-visible` 状态。
- 正文最小 16px，点击区域最小 44×44px。
- 表单必须具备真实 label、错误说明和输入建议。
- 图标按钮必须有可读名称或 `aria-label`。
- 状态不能只靠颜色表达。
- 支持浏览器缩放到 200%，内容仍可操作且不被裁切。
- 提供“长者模式”时，应增大字号和点击区域，而不是创建完全不同的信息架构。

## 14. Content Voice

- 使用公众熟悉的自然语言，避免内部行政术语。
- 先告诉用户可以做什么，再解释限制。
- 按钮使用动作词：开始咨询、生成材料、查看指引、继续办理。
- 避免“提交”“确定”等缺少上下文的按钮文案。
- AI 不确定时明确说明，不伪装成人工工作人员。
- 错误提示应说明原因和下一步，例如“身份证号码格式不正确，请检查后重试”。

## 15. Do and Don't

### Do

- 用一个强入口承载主要任务。
- 用留白、字体和对齐建立层级。
- 用政务蓝表达可信，用淡蓝表达选择和引导。
- 保持内容短、路径短、反馈快。
- 让 AI 主动理解自然语言，而不是要求用户先分类。
- 在关键节点说明数据用途、办理状态和下一步。

### Don't

- 不做传统政务门户首页。
- 不使用服务宫格填满页面。
- 不堆叠公告、新闻、政策文件和宣传栏。
- 不使用红蓝金等多种高饱和颜色同时竞争。
- 不使用政府大楼、握手、会议、城市天际线等素材填充首屏。
- 不添加卡通机器人或夸张 AI 球体。
- 不滥用渐变、玻璃拟态、霓虹光和大阴影。
- 不把简单操作包装成复杂后台或数据大屏。
- 不因为“政府项目”而降低现代感和交互效率。

## 16. Implementation Instructions for AI Agents

当 AI 编程助手实现或修改页面时，必须遵守以下顺序：

1. 先读取本文件，再检查现有项目结构和组件系统。
2. 先建立颜色、排版、间距、圆角和阴影设计变量。
3. 优先复用已有组件，不为了视觉改造破坏业务功能。
4. 首先实现页面骨架和 AI 输入交互，再实现三个能力入口。
5. 除非需求明确要求，不自行增加栏目、统计数据、公告或图片。
6. 保持页面低密度，并检查是否存在多余容器和卡片。
7. 完成桌面端后必须检查 390px、768px 和 1440px 三种宽度。
8. 最后执行无障碍、键盘、对比度和响应式检查。

如果用户需求与本规范冲突，优先满足真实业务功能，但不得擅自增加视觉复杂度。任何新增区域都必须说明其必要性。

## 17. Acceptance Checklist

- [ ] 首屏是否只有一个主要视觉中心？
- [ ] AI 输入框是否第一眼可见并可立即使用？
- [ ] 首屏能力入口是否不超过三个？
- [ ] 页面是否至少保留约 50% 的低干扰空间？
- [ ] 是否只使用一套蓝色主色系统？
- [ ] 是否避免传统门户、宫格、公告墙和宣传图片？
- [ ] 是否避免不必要的卡片、图标和阴影？
- [ ] 正文字号是否不低于 16px？
- [ ] 所有触控区域是否至少 44×44px？
- [ ] 键盘焦点是否清晰可见？
- [ ] 状态是否同时使用文字或图标说明？
- [ ] 移动端是否无横向滚动且 AI 入口仍然突出？
- [ ] 页面是否看起来像现代 AI 产品，同时保持公共服务的可信感？

## 18. Recommended Starter Prompt

```text
请先完整阅读项目根目录的 DESIGN.md，再检查现有代码。

按照该设计系统实现一个“政务 AI 助手”首页。不要制作传统政务门户，不要增加服务宫格、公告列表、数据看板、人物宣传图或政府大楼照片。

首屏只保留：简洁导航、主标题、一行说明、一个大型 AI 输入框、三个能力入口和一条简短信任信息。优先保证低信息密度、清晰交互、移动端适配和无障碍体验。

完成后对照 DESIGN.md 的 Acceptance Checklist 自查并直接修复不符合项。
```
