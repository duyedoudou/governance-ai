import type { Config, Context } from "@netlify/edge-functions";

type IntentMode = "chat" | "system_help" | "governance_query" | "document_query" | "clarify";

type IntentDecision = {
  mode: IntentMode;
  confidence: number;
  domain?: string;
  reason?: string;
  source: "rule" | "model" | "fallback";
};

function env(name: string) {
  try { return Netlify.env.get(name); } catch { return undefined; }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).replace(/[\s，。！？!?、~～…]+/g, "").toLowerCase();
}

function isDirectChat(q: string) {
  const n = normalized(q);
  if (!n) return false;
  if (/^(你好|您好|嗨|哈喽|hello|hi|在吗|在不在|来聊天|聊聊|陪我聊聊|陪我聊天|说说话|谢谢|多谢|谢了|辛苦了|好的|好嘞|行|可以|明白了|知道了|收到|哈哈|哈哈哈|再见|拜拜|晚安|早安|早上好|下午好|晚上好)$/.test(n)) return true;
  if (/^(你是谁|你叫什么|你会聊天吗|讲个笑话|说个笑话|我有点累|今天好累|有点烦|我好无聊|陪我一会儿)$/.test(n)) return true;
  return false;
}

function isSystemHelp(q: string) {
  return /(怎么用|如何使用|这个系统|你能做什么|你会什么|怎么上传|如何上传|上传资料|上传文件|怎么删除|如何删除|删除资料|删除文件|数据治理|确认发布|怎么发布|如何发布|查看依据|执行过程|怎么导出|如何导出|导出结果|参考数据在哪里|管理员入口|历史记录在哪里)/.test(q);
}

function governanceSignal(q: string) {
  return /(人口|村民|多少人|几个人|人员|名单|年龄|岁以上|岁以下|家庭|户籍|家庭户|村组|姓名|性别|出生|住址|养老|养老金|缴费|参保|待遇|低保|独居|高龄|残疾|行动不便|关爱|救助|民政|台风|防汛|防灾|转移|安置|应急|费用|支出|金额|政策|规定|条款|办法|依据|台账)/.test(q);
}

function backendRoutable(q: string, referenceContext: any) {
  const contextId = text(referenceContext?.asset_id);
  if (contextId) return true;
  if (governanceSignal(q)) return true;
  if (/(\d{2,3})\s*岁(?:以上|及以上|起)/.test(q)) return true;
  if (/([1-9]\d*)组/.test(q)) return true;
  if (/(?:查|看|查询|看看|关于)?\s*([\u4e00-\u9fa5]{2,4})(?:的|过去|历年|养老|缴费|情况)/.test(q)) return true;
  return false;
}

function ruleDecision(q: string, referenceContext: any, pathname: string): IntentDecision | null {
  if (isDirectChat(q)) return { mode: "chat", confidence: 0.99, reason: "明确闲聊表达", source: "rule" };
  if (isSystemHelp(q)) return { mode: "system_help", confidence: 0.98, reason: "系统使用问题", source: "rule" };

  const activeDocument = pathname === "/api/reference/document/query" || referenceContext?.asset_type === "document";
  if (activeDocument) {
    if (governanceSignal(q) && !/(方案|文档|资料|文件|预算|流程|人员配置|活动|其中|里面|上述|本方案|该方案)/.test(q)) {
      return { mode: "governance_query", confidence: 0.9, reason: "当前锁定文档，但问题明确指向村级治理数据", source: "rule" };
    }
    return { mode: "document_query", confidence: 0.92, reason: "当前已锁定文档，上下文优先", source: "rule" };
  }

  if (backendRoutable(q, referenceContext)) {
    return { mode: "governance_query", confidence: 0.92, reason: "命中受支持治理查询信号", source: "rule" };
  }
  return null;
}

async function gatewayJson(messages: any[]) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || "gpt-4.1-mini";
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages }),
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data: any = await resp.json();
  return { content: text(data.choices?.[0]?.message?.content), model };
}

async function gatewayText(messages: any[]) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || "gpt-4.1-mini";
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data: any = await resp.json();
  return { content: text(data.choices?.[0]?.message?.content), model };
}

async function modelDecision(q: string, referenceContext: any): Promise<IntentDecision> {
  try {
    const { content } = await gatewayJson([
      {
        role: "system",
        content: `你是黄林坑村治理AI的意图路由器。只做分类，不回答问题。\n\n允许的 mode：\n- chat：问候、感谢、寒暄、情绪表达、闲聊、笑话、与AI聊天。\n- system_help：询问这个系统怎么用、如何上传/删除/发布/导出/查看依据等。\n- governance_query：明确要求查询、统计、筛选、比较、解释黄林坑村治理数据或政策。\n- document_query：当前有参考文档上下文，并且问题是在继续问该文档内容。\n- clarify：意图不清，贸然查询数据库可能给出错误结果。\n\n硬规则：\n1. “来聊天”“谢谢”“辛苦了”“哈哈”“你是谁”“今天有点累”等必须是 chat，即使上一轮在工作。\n2. 不能因为出现“村里”两个字就认定是治理查询，例如“村里最近挺热闹啊”更接近 chat。\n3. 无法确定时选择 clarify，绝不能默认人口查询。\n4. 如果没有明确治理查询意图，不允许选择 governance_query。\n5. 输出严格 JSON：{"mode":"...","confidence":0-1,"domain":"可选","reason":"一句话"}`,
      },
      {
        role: "user",
        content: `用户输入：${q}\n当前参考资料：${JSON.stringify(referenceContext || null)}`,
      },
    ]);
    const parsed = JSON.parse(content || "{}");
    const allowed: IntentMode[] = ["chat", "system_help", "governance_query", "document_query", "clarify"];
    const mode = allowed.includes(parsed?.mode) ? parsed.mode : "clarify";
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));
    return { mode, confidence, domain: text(parsed?.domain) || undefined, reason: text(parsed?.reason) || undefined, source: "model" };
  } catch {
    return { mode: "clarify", confidence: 0.4, reason: "模型不可用且规则未识别到明确工作意图", source: "fallback" };
  }
}

function responsePayload(kind: "chat" | "system_help" | "clarify", answer: string, modelName = "none", decision?: IntentDecision) {
  const meta = kind === "chat" ? "未查询数据库" : kind === "system_help" ? "系统使用说明 · 未查询数据库" : "需要确认意图 · 未查询数据库";
  return Response.json({
    ok: true,
    model: { mode: decision?.source === "model" ? "intent-router+ai" : "intent-router", name: modelName, gateway: modelName !== "none" },
    plan: { intent: kind, domains: [], steps: [], detail: false, note: meta, router: decision },
    result: {
      kind,
      domain: kind === "chat" ? "闲聊" : kind === "system_help" ? "使用帮助" : "意图确认",
      title: kind === "chat" ? "AI村长" : kind === "system_help" ? "系统使用说明" : "我还不确定你想做什么",
      summary: answer,
      facts: [], rows: [], columns: [], recordRows: [], filters: [], evidence: [], tools: [],
      no_database_query: true,
    },
    narrative: answer,
    generated_at: new Date().toISOString(),
  });
}

async function chatResponse(q: string, decision: IntentDecision) {
  try {
    const { content, model } = await gatewayText([
      {
        role: "system",
        content: "你是黄林坑村治理AI里的‘AI村长’。当前是闲聊模式，不查询任何村民数据库，不编造村情事实。自然、简短、有一点人情味，不要使用官腔，也不要假装自己是真实村干部。",
      },
      { role: "user", content: q },
    ]);
    return responsePayload("chat", content || "当然可以，想聊点什么？", model, decision);
  } catch {
    const n = normalized(q);
    const fallback = /谢谢|多谢|辛苦/.test(n) ? "不客气，有事继续叫我。" : /你是谁|你叫什么/.test(n) ? "我是这里的 AI村长，可以陪你聊，也可以在你明确要办事时查询已发布的治理资料。" : "当然可以，想聊点什么？";
    return responsePayload("chat", fallback, "none", decision);
  }
}

function helpResponse(q: string, decision: IntentDecision) {
  let answer = "我可以帮你查已发布的村级治理数据、解读政策、查询管理员发布的资料，也可以陪你正常聊天。只有当你明确在办事或查询资料时，我才会调用治理数据。";
  if (/上传/.test(q)) answer = "管理员可以从右上角“演示管理员 → 数据治理”上传资料。上传后先自动分类，再由管理员确认发布；只有已发布资料才会进入 AI 查询。";
  else if (/删除/.test(q)) answer = "进入“演示管理员 → 数据治理 → 最近上传”，管理员上传的资料右侧有“删除”按钮。系统内置台账不会提供删除入口。";
  else if (/依据|执行过程/.test(q)) answer = "在工作查询结果底部可以打开“查看依据”和“执行过程”；闲聊模式不会查询数据库，所以不会显示数据依据。";
  else if (/导出/.test(q)) answer = "治理查询结果可以从结果卡片里的“导出结果”导出；闲聊内容不作为治理数据结果导出。";
  return responsePayload("system_help", answer, "none", decision);
}

function clarifyResponse(decision: IntentDecision) {
  return responsePayload("clarify", "我还不确定你是想聊天，还是要查村里的治理资料。你可以直接说“聊聊天”，也可以说得具体一点，比如“查一下70岁以上老人”或“看2026年养老保险未缴名单”。", "none", decision);
}

async function handleApi(req: Request, context: Context, pathname: string) {
  if (req.method !== "POST") return context.next();
  let body: any = {};
  try { body = await req.clone().json(); } catch { return context.next(); }
  const q = text(body?.query);
  if (!q) return context.next();
  const referenceContext = body?.reference_context && typeof body.reference_context === "object" ? body.reference_context : null;

  let decision = ruleDecision(q, referenceContext, pathname);
  if (!decision) decision = await modelDecision(q, referenceContext);

  if (decision.mode === "chat") return chatResponse(q, decision);
  if (decision.mode === "system_help") return helpResponse(q, decision);
  if (decision.mode === "clarify") return clarifyResponse(decision);

  if (decision.mode === "governance_query") {
    if (!backendRoutable(q, referenceContext)) return clarifyResponse({ ...decision, mode: "clarify", reason: "当前后端没有足够条件可靠执行这条治理查询" });
    if (pathname === "/api/reference/document/query") {
      const url = new URL(req.url);
      url.pathname = "/api/query";
      const forwarded = new Request(url.toString(), {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({ ...body, reference_context: null }),
      });
      return context.nextRequest(forwarded);
    }
    return context.next();
  }

  if (decision.mode === "document_query") {
    if (pathname === "/api/reference/document/query") return context.next();
    return clarifyResponse({ ...decision, mode: "clarify", reason: "未锁定可查询文档" });
  }

  return clarifyResponse({ mode: "clarify", confidence: 0.4, source: "fallback" });
}

async function injectIntentUi(context: Context) {
  const response = await context.next();
  const source = await response.text();
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/javascript; charset=utf-8");
  return new Response(`${source}\n;import(\"./intent-ui.js\").catch(()=>{});\n`, { status: response.status, headers });
}

export default async (req: Request, context: Context) => {
  const pathname = new URL(req.url).pathname;
  if (pathname === "/docx-integration.js" && req.method === "GET") return injectIntentUi(context);
  if (pathname === "/api/query" || pathname === "/api/reference/document/query") return handleApi(req, context, pathname);
  return context.next();
};

export const config: Config = {
  path: ["/api/query", "/api/reference/document/query", "/docx-integration.js"],
};
