import type { Config, Context } from "@netlify/edge-functions";

function env(name: string) { try { return Netlify.env.get(name); } catch { return undefined; } }
function text(v: unknown) { return String(v ?? "").trim(); }
function normalized(v: unknown) { return text(v).replace(/[\s，。！？!?、~～…]+/g, "").toLowerCase(); }

function isDirectChat(q: string) {
  const n = normalized(q); if (!n) return false;
  return /^(你好|您好|嗨|哈喽|hello|hi|在吗|在不在|来聊天|聊聊|陪我聊聊|陪我聊天|说说话|谢谢|多谢|谢了|辛苦了|好的|好嘞|行|可以|明白了|知道了|收到|哈哈|哈哈哈|再见|拜拜|晚安|早安|早上好|下午好|晚上好|你是谁|你叫什么|你会聊天吗|讲个笑话|说个笑话|我有点累|今天好累|有点烦|我好无聊|陪我一会儿)$/.test(n);
}

function isSystemHelp(q: string) {
  return /(怎么用|如何使用|这个系统|你能做什么|你会什么|怎么上传|如何上传|上传资料|上传文件|怎么删除|如何删除|删除资料|删除文件|数据治理|确认发布|怎么发布|如何发布|查看依据|执行过程|怎么导出|如何导出|导出结果|参考数据在哪里|管理员入口|历史记录在哪里|你的头像|AI村长头像|头像呢|头像没了|头像不见了)/.test(q);
}

async function gateway(messages: any[]) {
  const apiKey = env("OPENAI_API_KEY"); const baseUrl = env("OPENAI_BASE_URL"); const model = env("HLK_MODEL") || "gpt-4.1-mini";
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`}, body:JSON.stringify({model,messages}),
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data:any = await resp.json(); return { content:text(data.choices?.[0]?.message?.content), model };
}

function responsePayload(kind:"chat"|"system_help", answer:string, modelName="none") {
  return Response.json({
    ok:true,
    model:{mode:kind === "chat" ? "direct-chat-v053" : "system-help-v053",name:modelName,gateway:modelName!=="none"},
    plan:{intent:kind,domains:[],steps:[],detail:false,note:kind === "chat" ? "明确闲聊 · 未进入Agent工具规划" : "明确系统使用问题 · 未进入Agent工具规划"},
    result:{kind,domain:kind === "chat" ? "闲聊" : "使用帮助",title:kind === "chat" ? "AI村长" : "系统使用说明",summary:answer,facts:[],rows:[],columns:[],recordRows:[],filters:[],evidence:[],tools:[],no_database_query:true},
    narrative:answer,generated_at:new Date().toISOString(),
  });
}

async function chatResponse(q:string) {
  if (normalized(q) === "来聊天") return responsePayload("chat","可以呀，想聊什么？", "none");
  try {
    const {content,model} = await gateway([
      {role:"system",content:"你是黄林坑村治理AI里的AI村长。当前是明确闲聊，不查询数据库，不编造黄林坑村事实。不得主动声称当前天气、景色、村里近况、人物动态等未提供事实。自然、简短、有一点人情味，不要官腔，也不要假装是真实村干部。"},
      {role:"user",content:q},
    ]);
    return responsePayload("chat",content || "当然可以，想聊点什么？",model);
  } catch { return responsePayload("chat","当然可以，想聊点什么？"); }
}

function helpResponse(q:string) {
  let answer = "我可以正常聊天，也可以通过Agent搜索已发布资料、查询结构化治理数据，并在回答里保留依据。";
  if (/你的头像|AI村长头像|头像呢|头像没了|头像不见了/.test(q)) answer = "AI村长头像应该显示在每条回答左侧。当前页面会使用带版本号的头像地址避免旧缓存；如果第一次加载失败，会再尝试原始头像文件。";
  else if (/上传/.test(q)) answer = "管理员可从右上角“演示管理员 → 数据治理”上传资料，确认发布后才进入AI可查询范围。";
  else if (/删除/.test(q)) answer = "进入“演示管理员 → 数据治理 → 最近上传”，管理员上传资料右侧可删除；系统内置台账不可删除。";
  else if (/依据|执行过程/.test(q)) answer = "工作回答底部可以打开“查看依据”和“执行过程”。V0.5.3 会显示Agent选择了什么能力、检索了哪些资料，以及结构化查询真正生效的条件。";
  return responsePayload("system_help",answer);
}

function agentFailurePayload() {
  return Response.json({
    ok:true,
    model:{mode:"agent-v053-fallback",name:"none",gateway:false},
    plan:{intent:"clarify",domains:[],steps:[],detail:false,note:"Agent执行异常 · 已阻止HTTP 500透传"},
    result:{kind:"clarify",domain:"AI村长",title:"这次没有处理成功",summary:"刚才这条消息没有处理成功，但基础聊天和页面仍然可用。请再发一次；如果是查村里数据，我不会在失败时编造结果。",facts:[],rows:[],columns:[],recordRows:[],filters:[],evidence:[],tools:[],no_database_query:true},
    narrative:"刚才这条消息没有处理成功，但基础聊天和页面仍然可用。请再发一次；如果是查村里数据，我不会在失败时编造结果。",
    generated_at:new Date().toISOString(),
  });
}

async function forwardToAgent(req:Request, context:Context) {
  try {
    const url = new URL(req.url); url.pathname = "/api/agent-v053";
    const headers = new Headers(req.headers); headers.delete("content-length");
    const body = await req.clone().text();
    const response = await context.nextRequest(new Request(url.toString(),{method:req.method,headers,body}));
    if (response.status >= 500) return agentFailurePayload();
    return response;
  } catch {
    return agentFailurePayload();
  }
}

async function rewriteStatus(context:Context) {
  const response = await context.next(); if (!response.ok) return response;
  try {
    const data:any = await response.json(); data.version = "0.5.3.2"; data.intent_router = "minimal-shortcuts"; data.agent_planner = "v053"; data.query_kernel = "queryspec-v052"; data.knowledge_retrieval = "hybrid-v053";
    return Response.json(data,{status:response.status});
  } catch { return response; }
}

export default async (req:Request, context:Context) => {
  const pathname = new URL(req.url).pathname;
  if (pathname === "/api/status" && req.method === "GET") return rewriteStatus(context);

  if (pathname === "/api/reference/document/query") {
    if (req.method !== "POST") return context.next();
    let body:any = {}; try { body = await req.clone().json(); } catch { return context.next(); }
    const q = text(body?.query); if (!q) return context.next();
    if (isDirectChat(q)) return chatResponse(q);
    if (isSystemHelp(q)) return helpResponse(q);
    return context.next();
  }

  if (pathname === "/api/query") {
    if (req.method !== "POST") return context.next();
    let body:any = {}; try { body = await req.clone().json(); } catch { return context.next(); }
    const q = text(body?.query); if (!q) return context.next();
    if (isDirectChat(q)) return chatResponse(q);
    if (isSystemHelp(q)) return helpResponse(q);
    return forwardToAgent(req,context);
  }
  return context.next();
};

export const config:Config = { path:["/api/query","/api/reference/document/query","/api/status"] };
