import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { ensureKnowledgeIndex, indexKnowledgeAsset, searchKnowledge, synthesizeKnowledgeAnswer } from "../lib/knowledge-core.mts";

function json(data: unknown, init: ResponseInit = {}) { return Response.json(data, init); }
function cleanText(value: unknown) { return String(value ?? "").trim(); }

async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  const db = getDatabase();

  if (path === "/api/knowledge/index" && req.method === "POST") {
    const body: any = await req.json().catch(() => ({}));
    const assetId = cleanText(body.asset_id);
    if (!assetId) return json({ ok:false, error:"asset_id_required", message:"缺少资料ID。" }, { status:400 });
    const result = await indexKnowledgeAsset(db, assetId);
    return json({ ok:true, result });
  }

  if (path === "/api/knowledge/reindex" && req.method === "POST") {
    const body: any = await req.json().catch(() => ({}));
    const maxAssets = Math.min(100, Math.max(1, Number(body.max_assets || 30)));
    const result = await ensureKnowledgeIndex(db, maxAssets);
    return json({ ok:true, indexed:result });
  }

  if (path === "/api/knowledge/search" && req.method === "POST") {
    const body: any = await req.json().catch(() => ({}));
    const query = cleanText(body.query);
    if (!query) return json({ ok:false, error:"query_required", message:"请输入检索问题。" }, { status:400 });
    const retrieval = await searchKnowledge(db, query, { limit:body.limit, asset_id:cleanText(body.asset_id) || null });
    if (body.synthesize === false) return json({ ok:true, retrieval });
    const answer = await synthesizeKnowledgeAnswer(query, retrieval);
    return json({ ok:true, retrieval, answer });
  }

  return json({ ok:false, error:"not_found" }, { status:404 });
}

export default async (req: Request, _context: Context) => {
  try { return await handler(req); }
  catch (e:any) {
    console.error("knowledge error", e);
    return json({ ok:false, error:"knowledge_failed", message:e?.message || "知识检索失败。" }, { status:500 });
  }
};

export const config: Config = {
  path:["/api/knowledge/index","/api/knowledge/reindex","/api/knowledge/search"],
};
