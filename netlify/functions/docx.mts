import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getDeployStore, getStore } from "@netlify/blobs";
import * as mammoth from "mammoth";

const MAX_SEARCHABLE_CHARS = 300_000;
const MAX_MODEL_DOCUMENT_CHARS = 70_000;
const MODEL_DEFAULT = "gpt-4.1-mini";

function getSourceStore() {
  if (Netlify.context?.deploy.context === "production") {
    return getStore("governance-source", { consistency: "strong" });
  }
  return getDeployStore("governance-source");
}

function normalizeDocumentText(input: string) {
  return String(input || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isDocx(name: string, mime = "") {
  return /\.docx$/i.test(name) || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function env(name: string) {
  try { return Netlify.env.get(name); } catch { return undefined; }
}

async function callGateway(messages: any[]) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || MODEL_DEFAULT;
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data: any = await resp.json();
  return { text: String(data.choices?.[0]?.message?.content || "").trim(), model };
}

function queryTerms(query: string) {
  const stop = new Set(["这个","这份","资料","文件","里面","请问","帮我","一下","什么","哪些","多少","怎么","如何","情况","内容","根据","基于","参考","数据"]);
  const terms = new Set<string>();
  for (const token of query.match(/[A-Za-z0-9_.%-]{2,}|[\u4e00-\u9fa5]{2,}/g) || []) {
    if (!stop.has(token)) terms.add(token.toLowerCase());
    if (/^[\u4e00-\u9fa5]{4,}$/.test(token)) {
      for (let i = 0; i < token.length - 1; i++) {
        const gram = token.slice(i, i + 2);
        if (!stop.has(gram)) terms.add(gram);
      }
    }
  }
  return [...terms].slice(0, 40);
}

function chunkDocument(text: string, maxChars = 2400) {
  const paragraphs = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current.length + paragraph.length + 1) > maxChars && current) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > maxChars) {
      if (current) { chunks.push(current); current = ""; }
      for (let i = 0; i < paragraph.length; i += maxChars) chunks.push(paragraph.slice(i, i + maxChars));
    } else {
      current += (current ? "\n" : "") + paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function selectDocumentContext(text: string, query: string) {
  if (text.length <= MAX_MODEL_DOCUMENT_CHARS) return { text, mode: "全文" };
  const terms = queryTerms(query);
  const chunks = chunkDocument(text);
  const scored = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const term of terms) {
      let at = lower.indexOf(term);
      while (at !== -1) { score += term.length >= 4 ? 4 : 1; at = lower.indexOf(term, at + term.length); }
    }
    if (index === 0) score += 2;
    return { chunk, index, score };
  });
  scored.sort((a,b) => b.score - a.score || a.index - b.index);
  const selected = scored.slice(0, 18).sort((a,b) => a.index - b.index).map(x => `【片段 ${x.index + 1}】\n${x.chunk}`);
  return { text: selected.join("\n\n"), mode: `相关片段 ${selected.length}/${chunks.length}` };
}

async function reparseDocx(req: Request) {
  const body: any = await req.json().catch(() => ({}));
  const assetId = String(body.asset_id || "").trim();
  if (!assetId) return Response.json({ ok: false, error: "asset_id_required", message: "缺少 asset_id。" }, { status: 400 });

  const db = getDatabase();
  const { rows } = await db.pool.query(
    `SELECT asset_id, source_blob_key, source_file_name, mime_type, status
       FROM data_assets
      WHERE asset_id=$1
      LIMIT 1`,
    [assetId],
  );
  const asset = rows[0];
  if (!asset) return Response.json({ ok: false, error: "asset_not_found", message: "没有找到这份资料。" }, { status: 404 });
  if (!asset.source_blob_key) return Response.json({ ok: false, error: "source_file_missing", message: "这份资料没有保存可重新解析的源文件。" }, { status: 409 });
  if (!isDocx(asset.source_file_name, asset.mime_type)) return Response.json({ ok: false, error: "unsupported_document", message: "当前正文解析只支持 .docx 文件。" }, { status: 415 });

  const source = await getSourceStore().get(asset.source_blob_key, { type: "arrayBuffer" });
  if (!source) return Response.json({ ok: false, error: "source_blob_not_found", message: "源 DOCX 文件未找到，请重新上传。" }, { status: 404 });

  let extracted;
  try {
    extracted = await mammoth.extractRawText({ buffer: Buffer.from(source) });
  } catch (error: any) {
    return Response.json({ ok: false, error: "docx_parse_failed", message: `DOCX 正文解析失败：${error?.message || "未知错误"}` }, { status: 422 });
  }

  const fullText = normalizeDocumentText(extracted.value || "");
  if (!fullText) return Response.json({ ok: false, error: "docx_no_text", message: "DOCX 已打开，但没有提取到可读取文字。请检查文件是否主要由图片组成。" }, { status: 422 });

  const searchableText = fullText.slice(0, MAX_SEARCHABLE_CHARS);
  const warnings = (extracted.messages || []).map((m: any) => String(m?.message || m)).filter(Boolean).slice(0, 10);
  const paragraphCount = searchableText.split(/\n+/).filter(Boolean).length;

  await db.pool.query(
    `UPDATE data_assets
        SET searchable_text=$2,
            asset_type='document',
            updated_at=NOW()
      WHERE asset_id=$1`,
    [assetId, searchableText],
  );

  return Response.json({
    ok: true,
    asset: {
      asset_id: assetId,
      ai_ready: true,
      searchable_text_length: searchableText.length,
      original_text_length: fullText.length,
      truncated: fullText.length > searchableText.length,
      paragraph_count: paragraphCount,
      parse_note: fullText.length > searchableText.length
        ? `DOCX 正文已解析。为保证查询性能，当前保存前 ${searchableText.length.toLocaleString("zh-CN")} 个字符。`
        : `DOCX 正文已解析，共 ${searchableText.length.toLocaleString("zh-CN")} 个字符。`,
      parse_warnings: warnings,
    },
  });
}

async function queryDocument(req: Request) {
  const body: any = await req.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  const reference = body.reference_context && typeof body.reference_context === "object" ? body.reference_context : {};
  const assetId = String(reference.asset_id || body.asset_id || "").trim();
  if (!query) return Response.json({ ok: false, error: "query_required", message: "请输入要查询的问题。" }, { status: 400 });
  if (!assetId) return Response.json({ ok: false, error: "asset_id_required", message: "没有锁定要查询的文档。" }, { status: 400 });

  const db = getDatabase();
  const { rows } = await db.pool.query(
    `SELECT a.asset_id,a.title,a.source_file_name,a.searchable_text,a.status,a.version_label,
            COALESCE(c.name,a.proposed_category) AS category
       FROM data_assets a
       LEFT JOIN reference_categories c ON c.category_id=a.category_id
      WHERE a.asset_id=$1 AND a.status='published'
      LIMIT 1`,
    [assetId],
  );
  const asset = rows[0];
  if (!asset) return Response.json({ ok: false, error: "published_asset_not_found", message: "这份资料尚未发布或已不存在。" }, { status: 404 });
  const fullText = normalizeDocumentText(asset.searchable_text || "");
  if (!fullText) {
    return Response.json({
      ok: true,
      model: { mode: "document-not-parsed", name: "none" },
      plan: { intent: "gap", domains: [asset.category || "参考数据"], steps: [], detail: false, note: "DOCX 正文尚未解析" },
      result: {
        kind: "data_gap",
        domain: asset.category || "参考数据",
        title: "文档正文尚未解析",
        summary: `资料“${asset.title}”已经发布，但还没有可供 AI 查询的正文。请管理员在数据治理中点击“解析正文”。`,
        facts: [{ label: "资料状态", value: "已发布 · 待解析正文" }],
        rows: [], columns: [], recordRows: [], gap: true,
        filters: ["管理员需要先完成 DOCX 正文解析"],
        evidence: [asset.source_file_name],
        tools: [{ name: "docx_fulltext_query", desc: "正文尚未建立" }],
      },
      generated_at: new Date().toISOString(),
    });
  }

  const selected = selectDocumentContext(fullText, query);
  let answer = "";
  let model = MODEL_DEFAULT;
  let modelMode = "netlify-ai-gateway";
  try {
    const response = await callGateway([
      {
        role: "system",
        content: "你是黄林坑村治理智能助手。只允许根据下面提供的已发布文档正文回答，不得使用外部知识补齐，不得编造。先直接回答用户问题；需要时用简短条目。若正文没有支持某个结论，明确说‘这份资料中没有找到依据’。不要把自己描述成人工工作人员。",
      },
      {
        role: "user",
        content: `资料标题：${asset.title}\n源文件：${asset.source_file_name}\n检索模式：${selected.mode}\n\n【已发布文档正文】\n${selected.text}\n\n【用户问题】\n${query}`,
      },
    ]);
    answer = response.text;
    model = response.model;
  } catch {
    modelMode = "document-text-fallback";
    model = "none";
    answer = `已读取“${asset.title}”的正文，但当前模型服务暂不可用。您仍可在参考数据中查看完整提取文本。`;
  }

  return Response.json({
    ok: true,
    model: { mode: modelMode, name: model, gateway: modelMode === "netlify-ai-gateway" },
    plan: {
      intent: "document",
      domains: [asset.category || "参考数据"],
      steps: [{ tool: "docx_fulltext_query", params: { asset_id: asset.asset_id, retrieval: selected.mode } }],
      detail: false,
      note: "基于已发布 DOCX 正文回答",
    },
    result: {
      kind: "document_qa",
      domain: asset.category || "参考数据",
      title: asset.title,
      summary: answer,
      facts: [
        { label: "资料类型", value: "DOCX 全文" },
        { label: "检索范围", value: selected.mode },
      ],
      rows: [], columns: [], recordRows: [],
      filters: [`asset_id=${asset.asset_id}`, asset.version_label ? `版本=${asset.version_label}` : "", "仅使用已发布正文"].filter(Boolean),
      evidence: [asset.source_file_name],
      tools: [{ name: "docx_fulltext_query", desc: `${selected.mode} · ${fullText.length.toLocaleString("zh-CN")} 字符可检索` }],
    },
    narrative: answer,
    generated_at: new Date().toISOString(),
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  const path = new URL(req.url).pathname;
  if (path === "/api/governance/docx/reparse") return reparseDocx(req);
  if (path === "/api/reference/document/query") return queryDocument(req);
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
};

export const config: Config = {
  path: ["/api/governance/docx/reparse", "/api/reference/document/query"],
};
