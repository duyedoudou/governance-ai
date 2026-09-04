
import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getStore, getDeployStore } from "@netlify/blobs";
import * as XLSX from "xlsx";

type PlanStep = { tool: string; params?: Record<string, any> };
type QueryPlan = { intent: string; domains: string[]; steps: PlanStep[]; detail?: boolean; note?: string };

const AS_OF = "2026-09-04";
const MODEL_DEFAULT = "gpt-4.1-mini";
const ALLOWED_TOOLS = new Set(["person_filter","pension_stats","person_pension_history","emergency_event","policy_search","reference_dataset_query","data_gap"]);

const SYSTEM_REFERENCE_ALIASES: Record<string,string[]> = {
  "sys-people":["人口基础台账","人口台账","村民基础名册","村民名册","人口基础信息"],
  "sys-households":["家庭户台账","家庭台账","家庭户","户籍家庭台账","家庭信息台账"],
  "sys-pension":["养老保险缴费台账","养老保险台账","养老缴费台账","城乡居民养老保险业务台账","养老保险业务台账"],
  "sys-welfare":["民政与关爱台账","民政台账","关爱台账","低保台账","民政与关爱业务台账"],
  "sys-evacuations":["应急转移安置台账","应急转移台账","转移安置台账","台风转移台账","人员转移安置台账"],
  "sys-expenses":["应急费用台账","费用台账","防台费用台账","应急支出台账","应急费用"],
  "sys-policies":["政策文件库","政策库","政策资料库"]
};

const SYSTEM_FIELD_ALIASES: Record<string,Record<string,string>> = {
  "sys-people":{person_id:"人员ID",name:"姓名",gender:"性别",birth_date:"出生日期",age:"年龄",village_group:"村组",household_id:"家庭ID",address:"家庭地址",special_tags:"特殊标签",risk_tags:"风险标签"},
  "sys-households":{household_id:"家庭ID",village_group:"村组",address:"家庭地址",house_structure:"房屋结构",risk_level:"风险等级",geo_risk:"地理风险",notes:"备注"},
  "sys-pension":{name:"姓名",person_name:"姓名",village_group:"村组",year:"年度",payment_status:"缴费状态",tier_amount:"缴费档次",paid_amount:"实缴金额",payment_date:"缴费日期",subsidy_amount:"补贴金额"},
  "sys-welfare":{name:"姓名",person_name:"姓名",village_group:"村组",welfare_type:"关爱事项",status:"状态",start_date:"开始日期",end_date:"结束日期",notes:"备注"},
  "sys-evacuations":{event:"事件",event_name:"事件",name:"姓名",person_name:"姓名",village_group:"村组",evacuation_time:"转移时间",shelter:"安置地点",reason:"转移原因",return_time:"返回时间",status:"状态"},
  "sys-expenses":{event:"事件",event_name:"事件",category:"费用类别",summary:"摘要",expense_date:"日期",date:"日期",amount:"金额",verification_status:"核验状态"},
  "sys-policies":{domain:"政策领域",title:"标题",published_date:"发布日期",effective_date:"生效日期",status:"状态",applicable_to:"适用对象",summary:"摘要",clauses:"关键条款"}
};

const BUILTIN_REFERENCE_GUIDE = `
系统内置参考资料（这些 asset_id 固定有效，用户在“参考数据”中看到的资料对应如下）：
- sys-people：人口基础台账；字段：人员ID、姓名、性别、出生日期、年龄、村组、家庭ID、家庭地址、特殊标签、风险标签。
- sys-households：家庭户台账；字段：家庭ID、村组、家庭地址、房屋结构、风险等级、地理风险、备注。
- sys-pension：养老保险缴费台账；字段：姓名、村组、年度、缴费状态、缴费档次、实缴金额、缴费日期、补贴金额。
- sys-welfare：民政与关爱台账；字段：姓名、村组、关爱事项、状态、开始日期、结束日期、备注。
- sys-evacuations：应急转移安置台账；字段：事件、姓名、村组、转移时间、安置地点、转移原因、返回时间、状态。
- sys-expenses：应急费用台账；字段：事件、费用类别、摘要、日期、金额、核验状态。
- sys-policies：政策文件库；字段：政策领域、标题、发布日期、生效日期、状态、适用对象、摘要、关键条款。
当用户明确引用这些资料时，reference_dataset_query 的 asset_id 必须使用上面的 sys-*，绝不能把中文标题直接当 asset_id。能用 person_filter / pension_stats / emergency_event / policy_search 更准确回答时，优先使用专用工具。
`;

function normalizeAssetRef(v:any){
  return String(v??"").trim().replace(/^[“”"'\s]+|[“”"'\s]+$/g,"").replace(/^(参考数据|参考资料)[:：]?/,'').trim();
}
function resolveSystemAssetId(ref:any): string | null {
  const x=normalizeAssetRef(ref); if(!x) return null;
  if(SYSTEM_REFERENCE_ALIASES[x]) return x;
  for(const [id,aliases] of Object.entries(SYSTEM_REFERENCE_ALIASES)){ if(aliases.includes(x)) return id; }
  const fuzzy=Object.entries(SYSTEM_REFERENCE_ALIASES).filter(([,aliases])=>aliases.some(a=>a.includes(x)||x.includes(a)));
  return fuzzy.length===1?fuzzy[0][0]:null;
}
function extractReferencedAssetLabel(q:string){
  const m=q.match(/(?:基于|根据|从|用)?\s*(?:参考数据|参考资料)?\s*[“"']([^”"']+)[”"']/);
  return m?.[1]?normalizeAssetRef(m[1]):"";
}
function canonicalSystemField(assetId:string, field:any){
  const f=String(field??"").trim(); if(!f) return f; return SYSTEM_FIELD_ALIASES[assetId]?.[f] || f;
}
function extractPersonNameFromQuery(q:string){
  const patterns=[/(?:查|看看|查询)?\s*([\u4e00-\u9fa5]{2,4}?)(?:的)(?:养老|缴费|参保|待遇|档案)/, /([\u4e00-\u9fa5]{2,4}?)(?:过去|历年|近几年)(?:的)?(?:养老|缴费|参保)/];
  for(const re of patterns){const m=q.match(re);if(m?.[1] && !/养老|保险|缴费|待遇|历史|过去/.test(m[1])) return m[1];}
  return undefined;
}

const CATALOG_FOR_MODEL = `
黄林坑村 V0.4.9 Demo 已接入数据域：
1. 人口与家庭：姓名、性别、出生日期、村组、家庭地址、家庭风险、特殊标签。
2. 养老保险：参保状态、待遇状态、2024-2026年度缴费状态/档次/金额。
3. 民政与关爱：低保、独居老人、高龄老人、残疾/行动不便、临时救助等Demo事项。
4. 应急防灾：台风事件、转移人员、安置、干部参与、已核验费用。
5. 政策与文件：Demo养老、民政、防灾等虚构政策。
未接入：医疗保险、项目工程、土地与资产、车辆等。
`;

const PLAN_SYSTEM = `你是黄林坑村治理智能助手的Query Planner。你只生成查询计划，不回答事实。
事实必须由数据库工具计算，严禁自行创造人数、姓名、金额或政策条款。
输出严格JSON对象，不要Markdown。可用工具：
- person_filter: 跨人口/家庭/养老/民政筛人。params可用 min_age,max_age,gender,village_group,welfare_type,welfare_status,pension_year,pension_payment_status,pension_benefit_status,special_tag_contains,detail,group_by(village_group)。
- pension_stats: 养老年度统计。params: year,payment_status,group_by(village_group),detail。
- person_pension_history: 某人养老历史。params: person_name。
- emergency_event: 应急事件查询。params: event_ref(latest_typhoon或event_id/事件关键词),min_age,max_age,detail,include_households,include_expenses,include_cadres。
- policy_search: 政策检索。params: domain,keywords数组。
- reference_dataset_query: 查询“参考数据”中的已发布资料，既包括系统内置 sys-* 数据集，也包括数据治理端上传并发布的额外资料。params: asset_id,filters数组({field,op,value}),group_by,aggregate({op,count|sum|avg|min|max,field}),detail,keywords数组。系统内置资料必须使用有效 sys-* asset_id；能用 person_filter / pension_stats / emergency_event / policy_search 更准确回答时优先专用工具。绝不能把中文资料标题直接当 asset_id。
- data_gap: 数据未接入。params: missing_domain,suggested_fields数组。
一个问题可以包含多个步骤。若问题能用person_filter一次跨域完成，优先一次完成。
“上一次台风”使用 event_ref=latest_typhoon。“转移人数”默认按person_id去重。
历史事件年龄按事件开始日期计算。
如果用户问的事实数据域未接入，必须用data_gap，不能猜。
返回格式：{"intent":"data|policy|mixed|gap","domains":[...],"steps":[{"tool":"...","params":{...}}],"detail":true|false,"note":"简短计划说明"}`;

function env(name: string) { try { return Netlify.env.get(name); } catch { return undefined; } }

async function callGateway(messages: any[], jsonMode=false) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || MODEL_DEFAULT;
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const body:any = { model, messages };
  if (jsonMode) body.response_format = { type: "json_object" };
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`}, body:JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data:any = await resp.json();
  return { text: data.choices?.[0]?.message?.content || "", model };
}

function fallbackPlan(q:string): QueryPlan {
  const year = +(q.match(/20(24|25|26)/)?.[0] || (/今年/.test(q)?"2026":/去年/.test(q)?"2025":"2026"));
  const age = q.match(/(\d{1,3})\s*岁/); const minAge = age ? +age[1] : undefined;
  if (/台风|转移|防汛|防台/.test(q)) return {intent:"data",domains:["应急防灾"],steps:[{tool:"emergency_event",params:{event_ref:/上一次|上次|最近|上回/.test(q)?"latest_typhoon":undefined,min_age:minAge,detail:/谁|哪些|名单|明细/.test(q),include_households:/家庭|家里/.test(q),include_expenses:/花了|费用|多少钱/.test(q),include_cadres:/干部|参与/.test(q),focus:/花了|费用|多少钱|支出|金额/.test(q)?"expenses":/干部|参与/.test(q)?"cadres":"people"}}]};
  if (/政策|规定|条款|依据|怎么规定/.test(q)) return {intent:"policy",domains:["政策与文件"],steps:[{tool:"policy_search",params:{domain:/养老/.test(q)?"养老保险":/低保|救助|民政/.test(q)?"民政与关爱":/台风|防灾/.test(q)?"应急防灾":undefined,keywords:q.split(/[，。？！\s]+/).filter(Boolean).slice(0,8)}}]};
  if (/养老|养老金|参保|缴费|待遇/.test(q)) {
    const name = extractPersonNameFromQuery(q);
    if (name && /历史|过去|缴费情况|档案/.test(q)) return {intent:"data",domains:["养老保险"],steps:[{tool:"person_pension_history",params:{person_name:name}}]};
    if (/哪个组|各组|每组|缴费率|完成率/.test(q)) return {intent:"data",domains:["养老保险"],steps:[{tool:"pension_stats",params:{year,payment_status:/未缴|没缴/.test(q)?"未缴":undefined,group_by:/组/.test(q)?"village_group":undefined,detail:/谁|名单/.test(q)}}]};
    return {intent:"data",domains:["人口与家庭","养老保险"],steps:[{tool:"person_filter",params:{min_age:minAge,pension_year:year,pension_payment_status:/未缴|没缴/.test(q)?"未缴":undefined,pension_benefit_status:/未领|没领/.test(q)?"not_receiving":undefined,detail:/谁|哪些|名单|明细/.test(q)}}]};
  }
  if (/低保|独居|高龄|残疾|救助/.test(q)) return {intent:"data",domains:["人口与家庭","民政与关爱"],steps:[{tool:"person_filter",params:{min_age:minAge,welfare_type:/独居/.test(q)?"独居老人关爱":/低保/.test(q)?"最低生活保障":/残疾/.test(q)?"残疾/行动不便关爱":/高龄/.test(q)?"高龄老人关爱":"临时救助",detail:/谁|哪些|名单|明细/.test(q)}}]};
  if (/人口|村民|多少人|岁|男性|女性|村组|几组/.test(q)) return {intent:"data",domains:["人口与家庭"],steps:[{tool:"person_filter",params:{min_age:minAge,gender:/女性|女的/.test(q)?"女":/男性|男的/.test(q)?"男":undefined,village_group:q.match(/([1-6])\s*组/)?.[1]?`${q.match(/([1-6])\s*组/)?.[1]}组`:undefined,detail:/谁|哪些|名单|明细/.test(q),group_by:/各组|各村组|每组/.test(q)?"village_group":undefined}}]};
  return {intent:"gap",domains:[],steps:[{tool:"data_gap",params:{missing_domain:"未识别或未接入业务域",suggested_fields:["对象ID","业务状态","发生时间","来源文件"]}}]};
}


function preferredBuiltInStep(q:string, assetId:string, originalParams:any): PlanStep | null {
  const ageMatch=q.match(/(\d{1,3})\s*岁/); const minAge=ageMatch?Number(ageMatch[1]):undefined;
  const year=+(q.match(/20(24|25|26)/)?.[0] || (/今年/.test(q)?"2026":/去年/.test(q)?"2025":"2026"));
  const detail=/谁|哪些人|哪些村民|姓名|名单|明细|具体人员|人员都有谁|都有谁|调出来|列出来|看一下/.test(q);
  if(assetId==="sys-people") return {tool:"person_filter",params:{min_age:minAge,gender:/女性|女的/.test(q)?"女":/男性|男的/.test(q)?"男":undefined,village_group:q.match(/([1-6])\s*组/)?.[1]?`${q.match(/([1-6])\s*组/)?.[1]}组`:undefined,detail:detail||true,group_by:/各组|各村组|每组/.test(q)?"village_group":undefined}};
  if(assetId==="sys-pension"){
    const name=extractPersonNameFromQuery(q);
    if(name && /历史|过去|历年|档案|缴费情况/.test(q)) return {tool:"person_pension_history",params:{person_name:name}};
    if(/岁|年龄|独居|低保|高龄|残疾|救助/.test(q)) return {tool:"person_filter",params:{min_age:minAge,pension_year:year,pension_payment_status:/未缴|没缴/.test(q)?"未缴":/已缴/.test(q)?"已缴":undefined,pension_benefit_status:/未领|没领/.test(q)?"not_receiving":undefined,detail}};
    if(/未缴|没缴|已缴|哪个组|各组|每组|缴费率|完成率|20(24|25|26)|今年|去年/.test(q)) return {tool:"pension_stats",params:{year,payment_status:/未缴|没缴/.test(q)?"未缴":/已缴/.test(q)?"已缴":undefined,group_by:/组/.test(q)?"village_group":undefined,detail}};
  }
  if(assetId==="sys-welfare" && /低保|独居|高龄|残疾|救助/.test(q)) return {tool:"person_filter",params:{min_age:minAge,welfare_type:/独居/.test(q)?"独居老人关爱":/低保/.test(q)?"最低生活保障":/残疾/.test(q)?"残疾/行动不便关爱":/高龄/.test(q)?"高龄老人关爱":/救助/.test(q)?"临时救助":undefined,detail}};
  if(assetId==="sys-evacuations" && /台风|防汛|防台|上一次|上次|最近|上回|年龄|岁|家庭|干部|参与/.test(q)) return {tool:"emergency_event",params:{event_ref:/上一次|上次|最近|上回/.test(q)?"latest_typhoon":undefined,min_age:minAge,detail,include_households:/家庭|家里/.test(q),include_expenses:/花了|费用|多少钱|金额/.test(q),include_cadres:/干部|参与/.test(q)}};
  if(assetId==="sys-expenses" && /台风|上一次|上次|最近|上回/.test(q)) return {tool:"emergency_event",params:{event_ref:/上一次|上次|最近|上回/.test(q)?"latest_typhoon":undefined,detail:/明细|哪些费用|费用记录|列出来/.test(q),include_expenses:true,include_cadres:false,focus:"expenses"}};
  if(assetId==="sys-policies" && /政策|规定|条款|依据|怎么规定|养老|低保|救助|民政|台风|防灾/.test(q)) return {tool:"policy_search",params:{domain:/养老/.test(q)?"养老保险":/低保|救助|民政/.test(q)?"民政与关爱":/台风|防灾|防汛/.test(q)?"应急防灾":undefined,keywords:q.split(/[，。？！\s]+/).filter(Boolean).slice(0,8)}};
  return null;
}

function validatePlan(q:string, input:QueryPlan, referenceContext?:any): QueryPlan {
  const plan:QueryPlan = JSON.parse(JSON.stringify(input || {intent:"gap",domains:[],steps:[]}));
  const asksForDetail = /谁|哪些人|哪些村民|姓名|名单|明细|具体人员|人员都有谁|都有谁|人员情况|调出来|列出来|看一下/.test(q);
  const asksHousehold = /家庭情况|家庭成员|家里情况|家庭信息/.test(q);
  const asksExpense = /花了多少钱|费用|支出|花费|金额/.test(q);
  const asksCadres = /哪些干部|谁参与|干部参与|参与干部/.test(q);
  const labelFromQuery=extractReferencedAssetLabel(q);
  const contextAssetId=normalizeAssetRef(referenceContext?.asset_id||"");
  const contextTitle=normalizeAssetRef(referenceContext?.title||"");
  const referencedSystemAsset=resolveSystemAssetId(contextAssetId)||resolveSystemAssetId(contextTitle)||resolveSystemAssetId(labelFromQuery);
  if (asksForDetail) plan.detail = true;
  plan.steps = (plan.steps || []).map(step => {
    const params = {...(step.params || {})};
    if (step.tool === "reference_dataset_query") {
      if(contextAssetId) params.asset_id=contextAssetId;
      const canonical=resolveSystemAssetId(params.asset_id)||referencedSystemAsset;
      if(canonical) params.asset_id=canonical;
      const preferred=canonical?preferredBuiltInStep(q,canonical,params):null;
      if(preferred) return preferred;
    }
    if (asksForDetail && ["person_filter","pension_stats","emergency_event","reference_dataset_query"].includes(step.tool)) params.detail = true;
    if (step.tool === "emergency_event") {
      if (asksHousehold) params.include_households = true;
      if (asksExpense) params.include_expenses = true;
      if (asksCadres) params.include_cadres = true;
      if (asksExpense && !asksForDetail && !asksCadres) params.focus = "expenses";
      else if (asksCadres && !asksForDetail && !asksExpense) params.focus = "cadres";
      else if (!params.focus) params.focus = "people";
    }
    return {...step, params};
  });
  if(referenceContext?.category) plan.domains=[...new Set([...(plan.domains||[]),String(referenceContext.category)])];
  else if(referencedSystemAsset){
    const domainMap:Record<string,string>={"sys-people":"人口与家庭","sys-households":"人口与家庭","sys-pension":"养老保险","sys-welfare":"民政与关爱","sys-evacuations":"应急防灾","sys-expenses":"应急防灾","sys-policies":"政策与文件"};
    plan.domains=[...new Set([...(plan.domains||[]),domainMap[referencedSystemAsset]])];
  }
  return plan;
}

async function dynamicReferenceCatalog(db:any){
  try{
    const {rows}=await db.pool.query(`SELECT a.asset_id,a.dataset_id,a.title,a.asset_type,a.version_label,COALESCE(c.name,a.proposed_category) AS category,a.fields,a.record_count FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id WHERE a.status='published' AND COALESCE(a.is_current,true)=true AND (a.asset_type='structured' OR LENGTH(COALESCE(a.searchable_text,''))>0) ORDER BY a.published_at DESC NULLS LAST LIMIT 40`);
    if(!rows.length) return "当前没有额外发布的数据治理资料。";
    return "数据治理端额外上传并发布的参考资料（仅下列真实asset_id可被reference_dataset_query使用；不要用标题替代asset_id）：\n"+rows.map((r:any)=>`- asset_id=${r.asset_id}; dataset_id=${r.dataset_id||''}; 版本=${r.version_label||''}; 分类=${r.category||'未分类'}; 标题=${r.title}; 类型=${r.asset_type}; 记录=${r.record_count}; 字段=${JSON.stringify(r.fields||[])}`).join("\n");
  }catch{return "当前没有额外发布的数据治理资料。";}
}

async function makePlan(q:string, db:any, referenceContext?:any) {
  try {
    const dynamicCatalog=await dynamicReferenceCatalog(db);
    const contextGuide=referenceContext?.asset_id?`\n用户从“参考数据”界面明确选中了资料：asset_id=${referenceContext.asset_id}; dataset_id=${referenceContext.dataset_id||''}; 数据集=${referenceContext.dataset_title||''}; 版本=${referenceContext.version_label||''}; 标题=${referenceContext.title||''}; 分类=${referenceContext.category||''}。这是结构化上下文，优先级高于从自然语言猜资料ID；若使用reference_dataset_query必须沿用这个asset_id，并在连续追问中保持该资料上下文。`:"";
    const {text,model} = await callGateway([{role:"system",content:PLAN_SYSTEM+"\n"+CATALOG_FOR_MODEL+"\n"+BUILTIN_REFERENCE_GUIDE+"\n"+dynamicCatalog+contextGuide},{role:"user",content:q}], true);
    const parsed = JSON.parse(text);
    const steps=(parsed.steps||[]).filter((s:any)=>ALLOWED_TOOLS.has(s.tool)).slice(0,6);
    if (!steps.length) throw new Error("EMPTY_PLAN");
    return {plan:validatePlan(q,{...parsed,steps} as QueryPlan,referenceContext), modelMode:"netlify-ai-gateway", modelName:model};
  } catch (e) {
    return {plan:validatePlan(q,fallbackPlan(q),referenceContext), modelMode:"rule-fallback", modelName:"none"};
  }
}

function ageExpr(refParam:number){ return `EXTRACT(YEAR FROM age($${refParam}::date, p.birth_date))::int`; }

async function toolPersonFilter(db:any, params:any) {
  const values:any[]=[AS_OF]; let where=["1=1"]; let idx=2;
  if (params.min_age!=null){ where.push(`${ageExpr(1)} >= $${idx}`); values.push(+params.min_age); idx++; }
  if (params.max_age!=null){ where.push(`${ageExpr(1)} <= $${idx}`); values.push(+params.max_age); idx++; }
  if (params.gender){ where.push(`p.gender = $${idx}`); values.push(params.gender); idx++; }
  if (params.village_group){ where.push(`h.village_group = $${idx}`); values.push(params.village_group); idx++; }
  if (params.special_tag_contains){ where.push(`COALESCE(p.special_tags,'') ILIKE $${idx}`); values.push(`%${params.special_tag_contains}%`); idx++; }
  if (params.welfare_type){
    where.push(`EXISTS (SELECT 1 FROM welfare_records w WHERE w.person_id=p.person_id AND w.welfare_type=$${idx}${params.welfare_status?` AND w.status=$${idx+1}`:""})`);
    values.push(params.welfare_type); idx++; if(params.welfare_status){values.push(params.welfare_status);idx++;}
  }
  if (params.pension_year){
    let sub=`EXISTS (SELECT 1 FROM pension_payments pp WHERE pp.person_id=p.person_id AND pp.year=$${idx}`; values.push(+params.pension_year); idx++;
    if(params.pension_payment_status){sub+=` AND pp.payment_status=$${idx}`;values.push(params.pension_payment_status);idx++;} sub+=`)`; where.push(sub);
  }
  if (params.pension_benefit_status){
    if(params.pension_benefit_status==="not_receiving") where.push(`EXISTS (SELECT 1 FROM pension_accounts pa WHERE pa.person_id=p.person_id AND COALESCE(pa.benefit_status,'') <> '领取中')`);
    else {where.push(`EXISTS (SELECT 1 FROM pension_accounts pa WHERE pa.person_id=p.person_id AND pa.benefit_status=$${idx})`);values.push(params.pension_benefit_status);idx++;}
  }
  const sql=`SELECT p.person_id,p.name AS 姓名,p.gender AS 性别,${ageExpr(1)} AS 年龄,h.village_group AS 村组,h.address AS 家庭地址,p.special_tags AS 特殊标签,p.risk_tags AS 风险标签 FROM people p LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ORDER BY h.village_group,p.name`;
  const {rows}=await db.pool.query(sql,values);
  if(params.group_by==="village_group"){
    const counts:any={}; for(const r of rows) counts[r.村组||"未知"]=(counts[r.村组||"未知"]||0)+1;
    return {kind:"person_filter",title:"人员跨域筛选",summary:`符合条件的人员共 ${rows.length} 人。`,facts:[{label:"符合条件人数",value:`${rows.length} 人`}],rows:Object.entries(counts).map(([村组,人数])=>({村组,人数})),columns:["村组","人数"],recordRows:rows,filters:[`统计基准日 ${AS_OF}`]};
  }
  return {kind:"person_filter",title:"人员跨域筛选",summary:`符合条件的人员共 ${rows.length} 人。`,facts:[{label:"符合条件人数",value:`${rows.length} 人`}],rows:params.detail?rows:[],columns:["姓名","性别","年龄","村组","家庭地址","特殊标签","风险标签"],recordRows:rows,filters:[`统计基准日 ${AS_OF}`]};
}

async function toolPensionStats(db:any, params:any){
  const year=+(params.year||2026); const values:any[]=[year]; let where=["pp.year=$1"]; let idx=2;
  if(params.payment_status){where.push(`pp.payment_status=$${idx}`);values.push(params.payment_status);idx++;}
  const {rows}=await db.pool.query(`SELECT p.person_id,p.name AS 姓名,h.village_group AS 村组,pp.payment_status AS 缴费状态,pp.tier_amount AS 缴费档次,pp.paid_amount AS 实缴金额 FROM pension_payments pp JOIN people p ON p.person_id=pp.person_id LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ORDER BY h.village_group,p.name`,values);
  if(params.group_by==="village_group"){
    const counts:any={}; for(const r of rows) counts[r.村组||"未知"]=(counts[r.村组||"未知"]||0)+1;
    const grouped=Object.entries(counts).map(([村组,人数])=>({村组,人数})).sort((a:any,b:any)=>b.人数-a.人数);
    return {kind:"pension_stats",title:`${year}年度养老保险统计`,summary:`${year}年度符合条件的缴费记录共 ${rows.length} 条。`,facts:[{label:"记录数",value:`${rows.length} 条`},{label:"最多村组",value:grouped[0]?`${grouped[0].村组} · ${grouped[0].人数} 人`:"—"}],rows:grouped,columns:["村组","人数"],recordRows:rows,filters:[`年度=${year}`]};
  }
  const paid=rows.filter((r:any)=>r.缴费状态==="已缴").length;
  return {kind:"pension_stats",title:`${year}年度养老保险统计`,summary:`${year}年度查询到 ${rows.length} 条记录。`,facts:[{label:"记录数",value:`${rows.length} 条`},{label:"其中已缴",value:`${paid} 条`}],rows:params.detail?rows:[],columns:["姓名","村组","缴费状态","缴费档次","实缴金额"],recordRows:rows,filters:[`年度=${year}`]};
}

async function toolPensionHistory(db:any, params:any){
  const name=String(params.person_name||"").trim();
  const {rows:persons}=await db.pool.query(`SELECT p.person_id,p.name,h.village_group FROM people p LEFT JOIN households h ON h.household_id=p.household_id WHERE p.name=$1`,[name]);
  if(!persons.length) return {kind:"person_pension_history",title:"养老档案",summary:`未查到姓名为“${name}”的人员。`,facts:[],rows:[],columns:[],recordRows:[],filters:["姓名精确匹配"]};
  const p=persons[0]; const {rows}=await db.pool.query(`SELECT pp.year AS 年度,pp.payment_status AS 缴费状态,pp.tier_amount AS 缴费档次,pp.paid_amount AS 实缴金额,pp.payment_date AS 缴费日期,pp.subsidy_amount AS 补贴金额 FROM pension_payments pp WHERE pp.person_id=$1 ORDER BY pp.year`,[p.person_id]);
  const {rows:acct}=await db.pool.query(`SELECT enrollment_status,benefit_status FROM pension_accounts WHERE person_id=$1 LIMIT 1`,[p.person_id]);
  return {kind:"person_pension_history",title:`${name} · 养老保险档案`,summary:`已查询 ${name} 的Demo养老保险账户和历年缴费记录。`,facts:[{label:"参保状态",value:acct[0]?.enrollment_status||"—"},{label:"待遇状态",value:acct[0]?.benefit_status||"—"},{label:"缴费记录",value:`${rows.length} 年`}],rows,columns:["年度","缴费状态","缴费档次","实缴金额","缴费日期","补贴金额"],recordRows:rows,filters:["姓名精确匹配"]};
}

async function resolveEvent(db:any, ref:any){
  if(!ref || ref==="latest_typhoon") { const {rows}=await db.pool.query(`SELECT * FROM events WHERE event_type='台风' AND status='已结束' ORDER BY start_time DESC LIMIT 1`); return rows[0]; }
  const {rows}=await db.pool.query(`SELECT * FROM events WHERE event_id=$1 OR event_name ILIKE $2 ORDER BY start_time DESC LIMIT 1`,[ref,`%${ref}%`]); return rows[0];
}

async function toolEmergency(db:any, params:any){
  const ev=await resolveEvent(db,params.event_ref); if(!ev) return {kind:"emergency_event",title:"应急事件",summary:"未找到可唯一确定的事件。",facts:[],rows:[],columns:[],recordRows:[],filters:[]};
  const values:any[]=[ev.event_id,ev.start_time]; let where=["e.event_id=$1"]; let idx=3;
  if(params.min_age!=null){where.push(`EXTRACT(YEAR FROM age($2::timestamp, p.birth_date))::int >= $${idx}`);values.push(+params.min_age);idx++;}
  if(params.max_age!=null){where.push(`EXTRACT(YEAR FROM age($2::timestamp, p.birth_date))::int <= $${idx}`);values.push(+params.max_age);idx++;}
  const {rows:peopleRows}=await db.pool.query(`SELECT DISTINCT p.person_id,p.name AS 姓名,EXTRACT(YEAR FROM age($2::timestamp,p.birth_date))::int AS 当时年龄,h.village_group AS 村组,h.address AS 家庭地址,e.shelter AS 安置地点,e.reason AS 转移原因 FROM evacuations e JOIN people p ON p.person_id=e.person_id LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ORDER BY 当时年龄 DESC,p.name`,values);
  const peopleFact={label:"转移人数",value:`${peopleRows.length} 人`}; const extra:any={}; let expenseFact:any=null,cadreFact:any=null;
  if(params.include_expenses){
    const {rows:x}=await db.pool.query(`SELECT category AS "费用类别",summary AS "摘要",expense_date AS "日期",amount AS "金额",verification_status AS "核验状态" FROM expenses WHERE event_id=$1 ORDER BY expense_date,expense_id`,[ev.event_id]);
    extra.expense_rows=x; extra.expenses=x.filter((r:any)=>r.核验状态==='已核验').reduce((sum:number,r:any)=>sum+Number(r.金额||0),0); expenseFact={label:"已核验费用",value:`${extra.expenses.toLocaleString('zh-CN',{minimumFractionDigits:2})} 元`};
  }
  if(params.include_cadres){ const {rows:c}=await db.pool.query(`SELECT c.name AS 姓名,c.role AS 职务,ec.task_role AS 任务角色,ec.responsibility_area AS 负责区域 FROM event_cadres ec JOIN cadres c ON c.cadre_id=ec.cadre_id WHERE ec.event_id=$1 AND ec.confirmation_status='已确认' ORDER BY c.cadre_id`,[ev.event_id]); extra.cadres=c; cadreFact={label:"参与干部",value:`${c.length} 人`}; }
  const focus=params.focus||"people"; let facts:any[]=[peopleFact],rows:any[]=params.detail?peopleRows:[],columns=["姓名","当时年龄","村组","家庭地址","安置地点","转移原因"],recordRows:any[]=peopleRows,summary=`${ev.event_name}符合当前筛选条件的转移人员共 ${peopleRows.length} 人。`;
  if(expenseFact) facts.push(expenseFact); if(cadreFact) facts.push(cadreFact);
  if(focus==="expenses" && expenseFact){facts=[expenseFact,peopleFact,...(cadreFact?[cadreFact]:[])];rows=params.detail?(extra.expense_rows||[]):[];","安置��","村�Cv移原因"],recopws||[]):[];","gth} 条`},{D ec.confirmationfacts=[erecordR AS 实缴釮�庭�ws:any[]s=param费用"|policy|mixed|gap","dpolicy��瑘要",expense_date A){sub+=要",expe�`},{D ec.bel:"�$0"colopenses.toLocaleString([firpenses.to",expe�` 0 a 0; ",expe� a 0; "v移原因"],rseho:irmationfactsa 0; 
  const peop��,h.a`};
  }
  if(params.N cadres c Ora.expenceContext?.act]:[]+/*de=["pp.here.push(`${ere.push(`${ere.adres c Ora��龄,h.vre.ag`,[reber(r.金$  cons","�
  ifere.adifere.c Ora���ent_cadrea��龄,h.ECT DISTINC���fild WHERvr(rdreFacOra���erificati=="expn tool�fild W�S
ti=="f�erifins:["setRef(s( functioooleho:irtool�fillllehoople"; ve-vie移ssisrtool�符合�llllehoople";C*{:[];","宣;",�fild Wfilll���lllram househollllram h��地�rea��