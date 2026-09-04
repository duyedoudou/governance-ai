# V0.5.0 · DOCX 全文解析

## 本版解决的问题

V0.4.9 中 `.docx` 文件可以上传、分类、发布和查看源文件，但正文没有进入 `searchable_text`，因此 AI 会显示“文档归档 / 当前没有可供 AI 读取的全文文本”。

## 新增

- 新增独立 Netlify Function：`netlify/functions/docx.mts`。
- 管理员上传 DOCX 后，源文件保存完成即自动提取正文。
- 提取后的正文写回 `data_assets.searchable_text`，不新增临时聊天附件，也不改变普通用户侧只读原则。
- V0.4.9 以前已经上传的 DOCX，在数据治理最近上传列表中提供“解析正文”按钮，不需要重新上传。
- 从参考数据锁定 DOCX 后，连续追问走 `/api/reference/document/query` 专用全文问答路径。
- 文档不超过 70,000 字符时直接使用全文；更长文档按问题检索相关片段后回答。
- 回答只允许依据已发布文档正文，不允许用外部知识补齐。
- 源 DOCX 继续保存在 Netlify Blobs，提取文本继续保存在 Netlify Database，证据链保持不变。

## 当前边界

- `.docx`：支持正文解析与问答。
- `.doc`：暂不解析，继续归档；建议转为 `.docx`。
- PDF：本版暂不解析；文字 PDF 与扫描 PDF 后续分别处理。
