import type { Config, Context } from "@netlify/edge-functions";

function env(name: string) { try { return Netlify.env.get(name); } catch { return undefined; } }
function text(v: unknown) { return String(v ?? "").trim(); }
function parseJson(s: string) {
  try { return JSON.parse(String(s || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim() || "{}"); }
  catch { return {}; }
}

async function gateway(messages: any[], json = false) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || "gpt-4.1-mini";
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const body: any = { model, messages };
  if (json) body.response_format = { type: "json_object" };
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data: any = await resp.json();
  return { content: text(data.choices?.[0]?.message?.content), model };
}

type RouteMode = "conversation" | "system_help" | "tool";

async function semanticRoute(q: string, referenceContext: any): Promise<{ mode: RouteMode; reason: string; model: string }> {
  const { content, model } = await gateway([
    {
      role: "system",
      content: `你是黄林坑村治理AI的语义路由Gate。你不是关键词分类器，也不回答用户问题。你的唯一任务是判断：为了可靠回答用户，是否必须访问系统工具、村级数据库或已发布资料。

规则：
- conversation：不读取村级数据库或资料也能正常回答，包括普通交流、关于AI自身的提问、一般知识、分析、建议、创意讨论等。
- system_help：用户在询问这个系统本身如何使用、页面入口、上传发布、删除、依据、执行过程等产品操作。
- tool：回答必须依赖黄林坑村的具体事实、人员、数字、台账、政策原文、已发布文档、当前锁定资料或可核验证据。
- 不能因为一句话出现“村、养老、台风、蜂蜜、政策”等主题词就自动选择 tool；判断标准只有一个：回答是否真的必须读取村级事实或资料。
- 如果问题本身不要求黄林坑村的具体事实，优先 conversation。
- 如果不确定，优先 conversation，不要为了保险而乱查数据库。

只输出JSON：{"mode":"conversation|system_help|tool","reason":"一句话原因"}`,
    },
    {
      role: "user",
      content: `用户问题：${q}\n当前锁定资料上下文：${JSON.stringify(referenceContext || null)}`,
    },
  ], true);
  const out: any = parseJson(content);
  const mode: RouteMode = out.mode === "tool" ? "tool" : out.mode === "system_help" ? "system_help" : "conversation";
  return { mode, reason: text(out.reason), model };
}

function responsePayload(kind: "chat" | "system_help", answer: string, modelName = "none", note?: string) {
  return Response.json({
    ok: true,
    model: { mode: kind === "chat" ? "semantic-chat-v0534" : "semantic-system-help-v0534", name: modelName, gateway: modelName !== "none" },
    plan: { intent: kind, domains: [], steps: [], detail: false, note: note || (kind === "chat" ? "语义Gate判定无需工具" : "语义Gate判定为系统使用问题") },
    result: { kind, domain: kind === "chat" ? "对话" : "使用帮助", title: kind === "chat" ? "AI村长" : "系统使用说明", summary: answer, facts: [], rows: [], columns: [], recordRows: [], filters: [], evidence: [], tools: [], no_database_query: true },
    narrative: answer,
    generated_at: new Date().toISOString(),
  });
}

async function chatResponse(q: string, routeNote = "") {
  try {
    const { content, model } = await gateway([
      {
        role: "system",
        content: "你是黄林坑村治理AI里的AI村长。当前回答不调用村级数据库和资料。你可以正常聊天、介绍自己、解释一般知识、分析和给建议；但不得把一般知识编造成黄林坑村的具体事实，不得虚构当前天气、人数、人物动态、村务进展或任何未提供的数据。自然、直接、简洁，不要官腔，也不要假装是真实村干部。",
      },
      { role: "user", content: q },
    ]);
    return responsePayload("chat", content || "我在。你可以直接和我聊，也可以问需要查资料的村务问题。", model, routeNote || "语义Gate判定无需工具");
  } catch {
    return responsePayload("chat", "我在。你可以直接和我聊；如果问题涉及黄林坑村的具体人员、数字或资料，我会在工具恢复后再查证，不会凭空编。", "none", "语义Gate/对话模型暂不可用 · 已安全降级为无数据库回答");
  }
}

async function systemHelpResponse(q: string, routeNote = "") {
  const manual = `系统使用事实：
1. 管理员入口位于右上角“演示管理员”。
2. 数据治理中可以上传资料；上传后需确认发布，只有已发布资料进入AI可查询范围。
3. 管理员上传资料可在“数据治理 → 最近上传”中删除；系统内置台账不可删除。
4. 工作回答可查看“查看依据”和“执行过程”；执行过程用于展示Agent选择的能力、资料检索和结构化查询实际生效条件。
5. 参考数据用于查看已发布的数据集和资料。`;
  try {
    const { content, model } = await gateway([
      { role: "system", content: `你负责解释黄林坑村治理AI的使用方法。只能依据下面的系统使用事实回答，不要猜不存在的按钮、权限或功能。\n\n${manual}` },
      { role: "user", content: q },
    ]);
    return responsePayload("system_help", content || "你可以从右上角“演示管理员”进入数据治理；工作回答底部可查看依据和执行过程。", model, routeNote || "语义Gate判定为系统使用问题");
  } catch {
    return responsePayload("system_help", "你可以从右上角“演示管理员”进入数据治理；管理员上传资料需确认发布后才能被AI查询，已上传资料可在最近上传中删除。", "none", "系统帮助模型暂不可用 · 使用内置系统说明");
  }
}

function agentFailurePayload(status?: number) {
  return Response.json({
    ok: true,
    model: { mode: "agent-v0534-fallback", name: "none", gateway: false },
    plan: { intent: "clarify", domains: [], steps: [{ tool: "agent", params: { downstream_status: status || null } }], detail: false, note: "需要工具，但Agent执行异常 · 已阻止服务端错误直接透传" },
    result: { kind: "clarify", domain: "AI村长", title: "这次没有处理成功", summary: "这条问题需要读取村级数据或资料，但查询链路刚才没有成功。我不会用猜测补结果，请稍后再试。", facts: [], rows: [], columns: [], recordRows: [], filters: [], evidence: [], tools: [], no_database_query: true },
    narrative: "这条问题需要读取村级数据或资料，但查询链路刚才没有成功。我不会用猜测补结果，请稍后再试。",
    generated_at: new Date().toISOString(),
  });
}

async function forwardToAgent(req: Request, context: Context) {
  try {
    const url = new URL(req.url);
    url.pathname = "/api/agent-v053";
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    const body = await req.clone().text();
    const response = await context.nextRequest(new Request(url.toString(), { method: req.method, headers, body }));
    if (response.status >= 500) return agentFailurePayload(response.status);
    return response;
  } catch {
    return agentFailurePayload();
  }
}

async function rewriteStatus(context: Context) {
  const response = await context.next();
  if (!response.ok) return response;
  try {
    const data: any = await response.json();
    data.version = "0.5.3.4";
    data.intent_router = "semantic-tool-gate";
    data.agent_planner = "v053-lazy-db";
    data.query_kernel = "queryspec-v052";
    data.knowledge_retrieval = "hybrid-v053";
    return Response.json(data, { status: response.status });
  } catch { return response; }
}

export default async (req: Request, context: Context) => {
  const pathname = new URL(req.url).pathname;
  if (pathname === "/api/status" && req.method === "GET") return rewriteStatus(context);

  if ((pathname === "/api/query" || pathname === "/api/reference/document/query") && req.method === "POST") {
    let body: any = {};
    try { body = await req.clone().json(); } catch { return context.next(); }
    const q = text(body?.query);
    if (!q) return context.next();

    let route: { mode: RouteMode; reason: string; model: string };
    try {
      route = await semanticRoute(q, body?.reference_context || null);
    } catch {
      route = { mode: "conversation", reason: "语义Gate不可用，默认不调用工具", model: "none" };
    }

    if (route.mode === "conversation") return chatResponse(q, route.reason);
    if (route.mode === "system_help") return systemHelpResponse(q, route.reason);

    if (pathname === "/api/reference/document/query") return context.next();
    return forwardToAgent(req, context);
  }

  return context.next();
};

export const config: Config = { path: ["/api/query", "/api/reference/document/query", "/api/status"] };
