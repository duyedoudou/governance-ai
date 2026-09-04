import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getDeployStore, getStore } from "@netlify/blobs";
import * as mammoth from "mammoth";

const MAX_SEARCHABLE_CHARS = 300_000;

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

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  const body: any = await req.json().catch(() => ({}));
  const assetId = String(body.asset_id || "").trim();
  if (!assetId) {
    return Response.json({ ok: false, error: "asset_id_required", message: "缺少 asset_id。" }, { status: 400 });
  }

  const db = getDatabase();
  const { rows } = await db.pool.query(
    `SELECT asset_id, source_blob_key, source_file_name, mime_type, status
       FROM data_assets
      WHERE asset_id=$1
      LIMIT 1`,
    [assetId],
  );
  const asset = rows[0];
  if (!asset) {
    return Response.json({ ok: false, error: "asset_not_found", message: "没有找到这份资料。" }, { status: 404 });
  }
  if (!asset.source_blob_key) {
    return Response.json({ ok: false, error: "source_file_missing", message: "这份资料没有保存可重新解析的源文件。" }, { status: 409 });
  }
  if (!isDocx(asset.source_file_name, asset.mime_type)) {
    return Response.json({ ok: false, error: "unsupported_document", message: "当前正文解析只支持 .docx 文件。" }, { status: 415 });
  }

  const source = await getSourceStore().get(asset.source_blob_key, { type: "arrayBuffer" });
  if (!source) {
    return Response.json({ ok: false, error: "source_blob_not_found", message: "源 DOCX 文件未找到，请重新上传。" }, { status: 404 });
  }

  let extracted;
  try {
    extracted = await mammoth.extractRawText({ buffer: Buffer.from(source) });
  } catch (error: any) {
    return Response.json(
      { ok: false, error: "docx_parse_failed", message: `DOCX 正文解析失败：${error?.message || "未知错误"}` },
      { status: 422 },
    );
  }

  const fullText = normalizeDocumentText(extracted.value || "");
  if (!fullText) {
    return Response.json(
      { ok: false, error: "docx_no_text", message: "DOCX 已打开，但没有提取到可读取文字。请检查文件是否主要由图片组成。" },
      { status: 422 },
    );
  }

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
};

export const config: Config = {
  path: "/api/governance/docx/reparse",
};
