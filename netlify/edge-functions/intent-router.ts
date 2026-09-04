import type { Config, Context } from "@netlify/edge-functions";

type IntentMode = "chat" | "system_help" | "governance_query" | "document_query" | "clarify";
type IntentDecision = { mode: IntentMode; confidence: number; reason?: string; source: "rule" | "model" | "fallback" };

function env(name: string) { try { return Netlify.env.get(name); } catch { return undefined; } }
function text(v: unknown) { return String(v ?? "").trim(); }
function normalized(v: unknown) { return text(v).replace(/[\s，。！？!?、~～…]+/g, "").toLowerCase(); }

function isDirectChat(q: string) {
  const n = normalized(q); if (!n) return false;
  return /^(你好|您好|嗨|哈喽|hello|hi|在吗|在不在|来聊天|聊聊|陪我聊聊|陪我聊天|说说话|谢谢|多谢|谢了|辛苦了|好的|好嘞|行|可以|明白了|知道了|收到|哈哈|哈哈哈|再见|拜拜|晚安|早安|早上好|下午好|晚上好|你是谁|你叫什么|你会聊天吗|讲个笑话|说个笑话|我有点累|今天好累|有点烦|我好无聊|陪我一会儿)$/.test(n);
}
function isSystemHelp(q: string) { return /(怎么用|如何使用|这个系统|你能做什么|你会什么|怎么上传|如何上传|上传资料|上传文件|怎么删除|如何删除|删除资料|删除文件|数据治理|确认发布|怎么发布|如何发布|查看依据|执行过程|怎么导出|如何导出|导出结果|参考数据在哪里|管理员入口|历史记录在哪里)/.test(q); }
function governanceTopic(q: string) { return /(人口|村民|年龄|岁以上|岁以下|家庭|户籍|家庭户|家庭成员|成员|关系|村组|姓名|性别|出生|住址|干部|职务|责任区域|响应等级|养老|养老金|缴费|参保|待遇|低保|独居|高龄|残疾|行动不便|关爱|救助|民政|台风|防汛|防灾|转移|安置|应急|费用|支出|金额|政策|规定|条款|办法|依据|台账|风险|房屋|补贴)/.test(q); }
function explicitWorkIntent(q: string) { return /(查一下|查询|查查|查|看看|看下|统计|筛选|调出来|列出|汇总|合计|总额|多少|人数|户数|记录数|几个|几人|谁|哪些|名单|明细|记录|有没有|是否|未缴|已缴|以上|以下|大于|小于|不少于|不超过|介于|政策依据|怎么规定|什么政策|哪条规定|哪项政策|分别|按.+分组)/.test(q); }

function ruleDecision(q: string, referenceContext: any, pathname: string): IntentDecision | null {
  if (isDirectChat(q)) return { mode:"chat", confidence:0.99, reason:"明确闲聊表达", source:"rule" };
  if (isSystemHelp(q)) return { mode:"system_help", confidence:0.98, reason:"系统使用问题", source:"rule" };
  const activeDocument = pathname === "/api/reference/document/query" || referenceContext?.asset_type === "document";
  if (activeDocument) {
    const docWords = /(方案|文档|资料|文件|预算|流程|人员配置|活动|其中|里面|上述|本方案|该方案|正文)/.test(q);
    if (governanceTopic(q) && explicitWorkIntent(q) && !docWords) return { mode:"governance_query", confidence:0.9, reason:"明确转向治理结构化数据", source:"rule" };
    return { mode:"document_query", confidence:0.92, reason:"当前锁定文档", source:"rule" };
  }
  if (governanceTopic(q) && explicitWorkIntent(q)) return { mode:"governance_query", confidence:0.94, reason:"明确治理查询", source:"rule" };
  return null;
}

async function gateway(messages: any[], jsonMode = false) {
  const apiKey = env("OPENAI_API_KEY"); const baseUrl = env("OPENAI_BASE_URL"); const model = env("HLK_MODEL") || "gpt-4.1-mini";
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const body: any = { model, messages }; if (jsonMode) body.response_format = { type:"json_object" };
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`}, body:JSON.stringify(body) });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`); const data: any = await resp.json(); return { content:text(data.choices?.[0]?.message?.content), model };
}

async function modelDecision(q: string, referenceContext: any): Promise<IntentDecision> {
  try {
    const { content } = await gateway([
      { role:"system", content:`你是黄林坑村治理AI的意图路由器，只分类不回答。mode只能是chat/system_help/governance_query/document_query/clarify。\n规则：闲聊和情绪表达=chat；系统怎么用=system_help；只有明确要求查询/统计/筛选/比较治理数据或政策才=governance_query；锁定文档并继续问文档=document_query；不确定=clarify。不能因为出现“村里/养老/台风”就自动查数据。输出严格JSON：{"mode":"...","confidence":0-1,"reason":"..."}` },
      { role:"user", content:`用户输入：${q}\n参考资料：${JSON.stringify(referenceContext || null)}` },
    ], true);
    const parsed = JSON.parse(content || "{}"); const allowed: IntentMode[] = ["chat","system_help","governance_query","document_query","clarify"];
    const mode = allowed.includes(parsed.mode) ? parsed.mode : "clarify"; return { mode, confidence:Math.max(0,Math.min(1,Number(parsed.confidence ?? 0.5))), reason:text(parsed.reason), source:"model" };
  } catch { return { mode:"clarify", confidence:0.4, reason:"模型不可用且规则未确认工作意图", source:"fallback" }; }
}

function responsePayload(kind: "chat"|"system_help"|"clarify", answer: string, modelName = "none", decision?: IntentDecision) {
  return Response.json({ ok:true, model:{ mode:decision?.source === "model" ? "intent-router+ai" : "intent-router", name:modelName, gateway:modelName !== "none" },
    plan:{ intent:kind, domains:[], steps:[], detail:false, note:kind === "chat" ? "闲聊 · 未查询数据库" : kind === "system_help" ? "系统使用说明 · 未查询数据库" : "需要确认意图 · 未查询数据库", router:decision },
    result:{ kind, domain:kind === "chat" ? "闲聊" : kind === "system_help" ? "使用帮助" : "意图确认", title:kind === "chat" ? "AI村长" : kind === "system_help" ? "系统使用说明" : "我还不确定你想做什么", summary:answer, facts:[], rows:[], columns:[], recordRows:[], filters:[], evidence:[], tools:[], no_database_query:true }, narrative:answer, generated_at:new Date().toISOString() });
}

async function chatResponse(q: string, decision: IntentDecision) {
  try { const { content, model } = await gateway([{ role:"system", content:"你是黄林坑村治理AI里的AI村长。当前是闲聊模式，不查询村民数据库，不编造村情事实。自然、简短、有一点人情味，不要官腔，也不要假装自己是真实村干部。" }, { role:"user", content:q }]); return responsePayload("chat", content || "当然可以，想聊点什么？", model, decision); }
  catch { return responsePayload("chat", "当然可以，想聊点什么？", "none", decision); }
}
function helpResponse(q: string, decision: IntentDecision) {
  let answer = "我可以查询已发布的治理数据和资料，也可以正常聊天。只有明确办事或查询时才调用治理数据。";
  if (/上传/.test(q)) answer = "管理员可从右上角“演示管理员 → 数据治理”上传资料，确认发布后才进入AI查询。";
  else if (/删除/.test(q)) answer = "进入“演示管理员 → 数据治理 → 最近上传”，管理员上传资料右侧有“删除”按钮；系统内置台账不可删除。";
  else if (/依据|执行过程/.test(q)) answer = "工作查询结果底部可以打开“查看依据”和“执行过程”。V0.5.2 会显示识别约束、实际生效过滤条件和确定性执行信息。";
  return responsePayload("system_help", answer, "none", decision);
}
function clarifyResponse(decision: IntentDecision) { return responsePayload("clarify", "我还不确定你是想聊天，还是要查治理资料。可以直接说得具体一点，例如“查2组70岁以上女性人数”或“看2026年养老保险未缴名单”。", "none", decision); }

async function handleApi(req: Request, context: Context, pathname: string) {
  if (req.method !== "POST") return context.next(); let body: any = {};
  try { body = await req.clone().json(); } catch { return context.next(); }
  const q = text(body?.query); if (!q) return context.next(); const referenceContext = body?.reference_context && typeof body.reference_context === "object" ? body.reference_context : null;
  let decision = ruleDecision(q, referenceContext, pathname) || await modelDecision(q, referenceContext); if (decision.source === "model" && decision.confidence < 0.68) decision = { ...decision, mode:"clarify", reason:"模型判断置信度不足" };
  if (decision.mode === "chat") return chatResponse(q, decision); if (decision.mode === "system_help") return helpResponse(q, decision); if (decision.mode === "clarify") return clarifyResponse(decision);
  if (decision.mode === "document_query") return pathname === "/api/reference/document/query" ? context.next() : clarifyResponse({ ...decision, mode:"clarify", reason:"未锁定文档查询路由" });
  if (decision.mode === "governance_query") {
    const url = new URL(req.url); url.pathname = "/api/query-v052-exec"; const headers = new Headers(req.headers); headers.delete("content-length");
    const clearDocumentContext = pathname === "/api/reference/document/query" || referenceContext?.asset_type === "document";
    const forwarded = new Request(url.toString(), { method:"POST", headers, body:JSON.stringify({ ...body, reference_context:clearDocumentContext ? null : referenceContext }) });
    return context.nextRequest(forwarded);
  }
  return clarifyResponse({ mode:"clarify", confidence:0.4, source:"fallback" });
}

async function rewriteStatus(context: Context) {
  const response = await context.next(); if (!response.ok) return response;
  try { const data: any = await response.json(); data.version = "0.5.2"; data.intent_router = true; data.query_kernel = "queryspec-v052"; return Response.json(data, { status:response.status }); } catch { return response; }
}

export default async (req: Request, context: Context) => {
  const pathname = new URL(req.url).pathname;
  if (pathname === "/api/status" && req.method === "GET") return rewriteStatus(context);
  if (pathname === "/api/query" || pathname === "/api/reference/document/query") return handleApi(req, context, pathname);
  return context.next();
};
export const config: Config = { path:["/api/query","/api/reference/document/query","/api/status"] };
