import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const AS_OF = "2026-09-04";
const MODEL_DEFAULT = "gpt-4.1-mini";

type FieldType = "string" | "number" | "date" | "enum" | "tags";
type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "contains" | "not_contains" | "is_null" | "not_null";
type Filter = { field: string; op: Operator; value?: unknown; values?: unknown[] };
type Aggregate = { op: "count" | "count_distinct" | "sum" | "avg" | "min" | "max"; field?: string; alias?: string };
type Sort = { field: string; direction: "asc" | "desc" };
type QuerySpec = {
  dataset: string;
  user_constraints: string[];
  filters: Filter[];
  aggregate?: Aggregate | null;
  group_by?: string[];
  select?: string[];
  sort?: Sort[];
  limit?: number;
  output?: "summary" | "rows" | "both";
};

type FieldDef = { type: FieldType; label: string; expr: string; enumValues?: string[] };
type DatasetDef = { id: string; title: string; source: string; from: string; defaultSelect: string[]; fields: Record<string, FieldDef>; distinctRows?: boolean };

function env(name: string) { try { return Netlify.env.get(name); } catch { return undefined; } }
function cleanText(value: unknown) { return String(value ?? "").trim(); }
function json(data: unknown, init: ResponseInit = {}) { return Response.json(data, init); }

async function callGateway(messages: any[], jsonMode = false) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || MODEL_DEFAULT;
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const body: any = { model, messages };
  if (jsonMode) body.response_format = { type: "json_object" };
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data: any = await resp.json();
  return { text: cleanText(data.choices?.[0]?.message?.content), model };
}

const DATASETS: Record<string, DatasetDef> = {
  people: {
    id: "people", title: "人口基础台账", source: "sys-people", from: `people p LEFT JOIN households h ON h.household_id=p.household_id`,
    defaultSelect: ["person_id","name","gender","birth_date","age","village_group","household_id","address","special_tags","risk_tags"],
    fields: {
      person_id: { type: "string", label: "人员ID", expr: "p.person_id" }, name: { type: "string", label: "姓名", expr: "p.name" },
      gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] }, birth_date: { type: "date", label: "出生日期", expr: "p.birth_date" },
      age: { type: "number", label: "年龄", expr: `EXTRACT(YEAR FROM age('${AS_OF}'::date,p.birth_date))::int` }, village_group: { type: "string", label: "村组", expr: "h.village_group" },
      household_id: { type: "string", label: "家庭ID", expr: "h.household_id" }, address: { type: "string", label: "家庭地址", expr: "h.address" },
      special_tags: { type: "tags", label: "特殊标签", expr: "p.special_tags" }, risk_tags: { type: "tags", label: "风险标签", expr: "p.risk_tags" },
    },
  },
  people_governance: {
    id: "people_governance", title: "人员综合治理视图", source: "multi-person-governance",
    from: `people p
      LEFT JOIN households h ON h.household_id=p.household_id
      LEFT JOIN pension_accounts pa ON pa.person_id=p.person_id
      LEFT JOIN pension_payments pp ON pp.person_id=p.person_id
      LEFT JOIN welfare_records w ON w.person_id=p.person_id
      LEFT JOIN evacuations e ON e.person_id=p.person_id
      LEFT JOIN events ev ON ev.event_id=e.event_id`,
    defaultSelect: ["person_id","name","gender","age","village_group","address","special_tags","risk_tags"],
    distinctRows: true,
    fields: {
      person_id: { type: "string", label: "人员ID", expr: "p.person_id" },
      name: { type: "string", label: "姓名", expr: "p.name" },
      gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] },
      birth_date: { type: "date", label: "出生日期", expr: "p.birth_date" },
      age: { type: "number", label: "年龄", expr: `EXTRACT(YEAR FROM age('${AS_OF}'::date,p.birth_date))::int` },
      village_group: { type: "string", label: "村组", expr: "h.village_group" },
      household_id: { type: "string", label: "家庭ID", expr: "h.household_id" },
      address: { type: "string", label: "家庭地址", expr: "h.address" },
      special_tags: { type: "tags", label: "特殊标签", expr: "p.special_tags" },
      risk_tags: { type: "tags", label: "风险标签", expr: "p.risk_tags" },
      insurance_type: { type: "string", label: "参保类型", expr: "pa.insurance_type" },
      enrollment_status: { type: "string", label: "参保状态", expr: "pa.enrollment_status" },
      enrollment_date: { type: "date", label: "参保日期", expr: "pa.enrollment_date" },
      benefit_status: { type: "string", label: "待遇状态", expr: "pa.benefit_status" },
      pension_year: { type: "number", label: "养老缴费年度", expr: "pp.year" },
      payment_status: { type: "enum", label: "养老缴费状态", expr: "pp.payment_status", enumValues: ["已缴","未缴"] },
      tier_amount: { type: "number", label: "缴费档次", expr: "pp.tier_amount" },
      paid_amount: { type: "number", label: "实缴金额", expr: "pp.paid_amount" },
      payment_date: { type: "date", label: "缴费日期", expr: "pp.payment_date" },
      subsidy_amount: { type: "number", label: "补贴金额", expr: "pp.subsidy_amount" },
      welfare_type: { type: "string", label: "关爱事项", expr: "w.welfare_type" },
      welfare_status: { type: "string", label: "关爱状态", expr: "w.status" },
      welfare_start_date: { type: "date", label: "关爱开始日期", expr: "w.start_date" },
      welfare_end_date: { type: "date", label: "关爱结束日期", expr: "w.end_date" },
      event: { type: "string", label: "应急事件", expr: "ev.event_name" },
      event_type: { type: "string", label: "事件类型", expr: "ev.event_type" },
      event_start: { type: "date", label: "事件开始时间", expr: "ev.start_time" },
      age_at_event: { type: "number", label: "事件发生时年龄", expr: "EXTRACT(YEAR FROM age(ev.start_time,p.birth_date))::int" },
      evacuation_time: { type: "date", label: "转移时间", expr: "e.evacuation_time" },
      shelter: { type: "string", label: "安置地点", expr: "e.shelter" },
      evacuation_status: { type: "string", label: "转移状态", expr: "e.status" },
    },
  },
  households: {
    id: "households", title: "家庭户台账", source: "sys-households", from: `households h`, defaultSelect: ["household_id","village_group","address","house_structure","risk_level","geo_risk","notes"],
    fields: {
      household_id: { type: "string", label: "家庭ID", expr: "h.household_id" }, village_group: { type: "string", label: "村组", expr: "h.village_group" },
      address: { type: "string", label: "家庭地址", expr: "h.address" }, house_structure: { type: "string", label: "房屋结构", expr: "h.house_structure" },
      risk_level: { type: "string", label: "风险等级", expr: "h.risk_level" }, geo_risk: { type: "string", label: "地理风险", expr: "h.geo_risk" }, notes: { type: "string", label: "备注", expr: "h.notes" },
    },
  },
  household_members: {
    id: "household_members", title: "家庭成员关系", source: "sys-households", from: `household_members hm JOIN people p ON p.person_id=hm.person_id JOIN households h ON h.household_id=hm.household_id`,
    defaultSelect: ["household_id","person_id","name","gender","age","village_group","address","relation","valid_from","valid_to","status"],
    fields: {
      household_id: { type: "string", label: "家庭ID", expr: "hm.household_id" }, person_id: { type: "string", label: "人员ID", expr: "hm.person_id" }, name: { type: "string", label: "姓名", expr: "p.name" },
      gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] }, age: { type: "number", label: "年龄", expr: `EXTRACT(YEAR FROM age('${AS_OF}'::date,p.birth_date))::int` },
      village_group: { type: "string", label: "村组", expr: "h.village_group" }, address: { type: "string", label: "家庭地址", expr: "h.address" }, relation: { type: "string", label: "家庭关系", expr: "hm.relation" },
      valid_from: { type: "date", label: "有效开始", expr: "hm.valid_from" }, valid_to: { type: "date", label: "有效结束", expr: "hm.valid_to" }, status: { type: "string", label: "状态", expr: "hm.status" },
    },
  },
  pension: {
    id: "pension", title: "养老保险缴费台账", source: "sys-pension", from: `pension_payments pp JOIN people p ON p.person_id=pp.person_id LEFT JOIN households h ON h.household_id=p.household_id`,
    defaultSelect: ["name","gender","village_group","year","payment_status","tier_amount","paid_amount","payment_date","subsidy_amount"],
    fields: {
      person_id: { type: "string", label: "人员ID", expr: "p.person_id" }, name: { type: "string", label: "姓名", expr: "p.name" }, gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] },
      village_group: { type: "string", label: "村组", expr: "h.village_group" }, year: { type: "number", label: "年度", expr: "pp.year" }, payment_status: { type: "enum", label: "缴费状态", expr: "pp.payment_status", enumValues: ["已缴","未缴"] },
      tier_amount: { type: "number", label: "缴费档次", expr: "pp.tier_amount" }, paid_amount: { type: "number", label: "实缴金额", expr: "pp.paid_amount" }, payment_date: { type: "date", label: "缴费日期", expr: "pp.payment_date" }, subsidy_amount: { type: "number", label: "补贴金额", expr: "pp.subsidy_amount" },
    },
  },
  pension_accounts: {
    id: "pension_accounts", title: "养老保险账户", source: "sys-pension", from: `pension_accounts pa JOIN people p ON p.person_id=pa.person_id LEFT JOIN households h ON h.household_id=p.household_id`,
    defaultSelect: ["person_id","name","gender","age","village_group","insurance_type","enrollment_status","enrollment_date","benefit_status","updated_at"],
    fields: {
      person_id: { type: "string", label: "人员ID", expr: "p.person_id" }, name: { type: "string", label: "姓名", expr: "p.name" }, gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] },
      age: { type: "number", label: "年龄", expr: `EXTRACT(YEAR FROM age('${AS_OF}'::date,p.birth_date))::int` }, village_group: { type: "string", label: "村组", expr: "h.village_group" },
      insurance_type: { type: "string", label: "参保类型", expr: "pa.insurance_type" }, enrollment_status: { type: "string", label: "参保状态", expr: "pa.enrollment_status" }, enrollment_date: { type: "date", label: "参保日期", expr: "pa.enrollment_date" },
      benefit_status: { type: "string", label: "待遇状态", expr: "pa.benefit_status" }, updated_at: { type: "date", label: "更新时间", expr: "pa.updated_at" },
    },
  },
  welfare: {
    id: "welfare", title: "民政与关爱台账", source: "sys-welfare", from: `welfare_records w JOIN people p ON p.person_id=w.person_id LEFT JOIN households h ON h.household_id=p.household_id`,
    defaultSelect: ["name","gender","age","village_group","welfare_type","status","start_date","end_date","notes"],
    fields: {
      person_id: { type: "string", label: "人员ID", expr: "p.person_id" }, name: { type: "string", label: "姓名", expr: "p.name" }, gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] },
      age: { type: "number", label: "年龄", expr: `EXTRACT(YEAR FROM age('${AS_OF}'::date,p.birth_date))::int` }, village_group: { type: "string", label: "村组", expr: "h.village_group" }, welfare_type: { type: "string", label: "关爱事项", expr: "w.welfare_type" },
      status: { type: "string", label: "状态", expr: "w.status" }, start_date: { type: "date", label: "开始日期", expr: "w.start_date" }, end_date: { type: "date", label: "结束日期", expr: "w.end_date" }, notes: { type: "string", label: "备注", expr: "w.notes" },
    },
  },
  evacuations: {
    id: "evacuations", title: "应急转移安置台账", source: "sys-evacuations", from: `evacuations e JOIN events ev ON ev.event_id=e.event_id JOIN people p ON p.person_id=e.person_id LEFT JOIN households h ON h.household_id=p.household_id`,
    defaultSelect: ["event","person_id","name","gender","age_at_event","village_group","address","evacuation_time","shelter","reason","return_time","status"],
    fields: {
      event_id: { type: "string", label: "事件ID", expr: "ev.event_id" }, event: { type: "string", label: "事件", expr: "ev.event_name" }, event_type: { type: "string", label: "事件类型", expr: "ev.event_type" }, event_start: { type: "date", label: "事件开始时间", expr: "ev.start_time" },
      person_id: { type: "string", label: "人员ID", expr: "p.person_id" }, name: { type: "string", label: "姓名", expr: "p.name" }, gender: { type: "enum", label: "性别", expr: "p.gender", enumValues: ["男","女"] },
      age_at_event: { type: "number", label: "当时年龄", expr: "EXTRACT(YEAR FROM age(ev.start_time,p.birth_date))::int" }, village_group: { type: "string", label: "村组", expr: "h.village_group" }, address: { type: "string", label: "家庭地址", expr: "h.address" },
      evacuation_time: { type: "date", label: "转移时间", expr: "e.evacuation_time" }, shelter: { type: "string", label: "安置地点", expr: "e.shelter" }, reason: { type: "string", label: "转移原因", expr: "e.reason" }, return_time: { type: "date", label: "返回时间", expr: "e.return_time" }, status: { type: "string", label: "状态", expr: "e.status" },
    },
  },
  events: {
    id: "events", title: "应急事件台账", source: "sys-evacuations", from: `events ev`, defaultSelect: ["event_id","event_type","event","start_time","end_time","response_level","status"],
    fields: {
      event_id: { type: "string", label: "事件ID", expr: "ev.event_id" }, event_type: { type: "string", label: "事件类型", expr: "ev.event_type" }, event: { type: "string", label: "事件", expr: "ev.event_name" },
      start_time: { type: "date", label: "开始时间", expr: "ev.start_time" }, end_time: { type: "date", label: "结束时间", expr: "ev.end_time" }, response_level: { type: "string", label: "响应等级", expr: "ev.response_level" }, status: { type: "string", label: "状态", expr: "ev.status" },
    },
  },
  cadres: {
    id: "cadres", title: "村干部台账", source: "sys-evacuations", from: `cadres c`, defaultSelect: ["cadre_id","name","role","responsibility_area","masked_phone","status"],
    fields: {
      cadre_id: { type: "string", label: "干部ID", expr: "c.cadre_id" }, name: { type: "string", label: "姓名", expr: "c.name" }, role: { type: "string", label: "职务", expr: "c.role" },
      responsibility_area: { type: "string", label: "责任区域", expr: "c.responsibility_area" }, masked_phone: { type: "string", label: "脱敏电话", expr: "c.masked_phone" }, status: { type: "string", label: "状态", expr: "c.status" },
    },
  },
  event_cadres: {
    id: "event_cadres", title: "应急事件干部参与", source: "sys-evacuations", from: `event_cadres ec JOIN events ev ON ev.event_id=ec.event_id JOIN cadres c ON c.cadre_id=ec.cadre_id`,
    defaultSelect: ["event","event_type","event_start","cadre_id","name","role","task_role","responsibility_area","confirmation_status"],
    fields: {
      event_id: { type: "string", label: "事件ID", expr: "ev.event_id" }, event: { type: "string", label: "事件", expr: "ev.event_name" }, event_type: { type: "string", label: "事件类型", expr: "ev.event_type" }, event_start: { type: "date", label: "事件开始时间", expr: "ev.start_time" },
      cadre_id: { type: "string", label: "干部ID", expr: "c.cadre_id" }, name: { type: "string", label: "姓名", expr: "c.name" }, role: { type: "string", label: "职务", expr: "c.role" }, task_role: { type: "string", label: "任务角色", expr: "ec.task_role" },
      responsibility_area: { type: "string", label: "责任区域", expr: "ec.responsibility_area" }, confirmation_status: { type: "string", label: "确认状态", expr: "ec.confirmation_status" },
    },
  },
  expenses: {
    id: "expenses", title: "应急费用台账", source: "sys-expenses", from: `expenses x JOIN events ev ON ev.event_id=x.event_id`, defaultSelect: ["event","event_type","category","summary","expense_date","amount","verification_status"],
    fields: {
      event_id: { type: "string", label: "事件ID", expr: "ev.event_id" }, event: { type: "string", label: "事件", expr: "ev.event_name" }, event_type: { type: "string", label: "事件类型", expr: "ev.event_type" }, event_start: { type: "date", label: "事件开始时间", expr: "ev.start_time" },
      category: { type: "string", label: "费用类别", expr: "x.category" }, summary: { type: "string", label: "摘要", expr: "x.summary" }, expense_date: { type: "date", label: "日期", expr: "x.expense_date" }, amount: { type: "number", label: "金额", expr: "x.amount" }, verification_status: { type: "string", label: "核验状态", expr: "x.verification_status" },
    },
  },
  policies: {
    id: "policies", title: "政策文件库", source: "sys-policies", from: `policies po`, defaultSelect: ["domain","title","published_date","effective_date","status","applicable_to","summary","clauses"],
    fields: {
      domain: { type: "string", label: "政策领域", expr: "po.domain" }, title: { type: "string", label: "标题", expr: "po.title" }, published_date: { type: "date", label: "发布日期", expr: "po.published_date" }, effective_date: { type: "date", label: "生效日期", expr: "po.effective_date" },
      status: { type: "string", label: "状态", expr: "po.status" }, applicable_to: { type: "string", label: "适用对象", expr: "po.applicable_to" }, summary: { type: "string", label: "摘要", expr: "po.summary" }, clauses: { type: "tags", label: "关键条款", expr: "po.clauses::text" },
    },
  },
};

const ASSET_TO_DATASETS: Record<string, string[]> = {
  "sys-people": ["people"], "sys-households": ["households","household_members"], "sys-pension": ["pension","pension_accounts"], "sys-welfare": ["welfare"],
  "sys-evacuations": ["evacuations","events","event_cadres","cadres"], "sys-expenses": ["expenses","events"], "sys-policies": ["policies"],
};

function schemaPrompt(defs: DatasetDef[]) {
  return defs.map(d => `- dataset=${d.id}，资料=${d.title}，fields：${Object.entries(d.fields).map(([id,f]) => `${id}(${f.label},${f.type}${f.enumValues ? `,枚举=${f.enumValues.join("/")}` : ""})`).join("；")}`).join("\n");
}
function parseJsonObject(text: string) { return JSON.parse(cleanText(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "") || "{}"); }

async function loadUploadedSchema(db: any, assetId: string) {
  const { rows: assets } = await db.pool.query(`SELECT a.asset_id,a.title,a.fields,a.asset_type,a.status,COALESCE(c.name,a.proposed_category) AS category FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id WHERE a.asset_id=$1 AND a.status='published' LIMIT 1`, [assetId]);
  const asset = assets[0];
  if (!asset) throw new Error("REFERENCE_ASSET_NOT_FOUND");
  if (asset.asset_type !== "structured") throw new Error("DOCUMENT_QUERY_REQUIRES_DOCUMENT_ROUTE");
  const { rows: sampleRows } = await db.pool.query(`SELECT data FROM data_asset_records WHERE asset_id=$1 ORDER BY row_no LIMIT 30`, [assetId]);
  const sample = sampleRows.map((x:any) => x.data);
  const rawFields: string[] = Array.isArray(asset.fields) ? asset.fields : [];
  const fieldDefs: Record<string, { label:string; type:FieldType }> = {};
  for (const field of rawFields) {
    const vals = sample.map((r:any) => r?.[field]).filter((v:any) => v !== null && v !== undefined && v !== "").slice(0, 20);
    let type: FieldType = "string";
    if (vals.length && vals.every((v:any) => typeof v === "number" || /^-?\d+(?:\.\d+)?$/.test(String(v).replace(/,/g,"")))) type = "number";
    else if (vals.length && vals.every((v:any) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(v)))) type = "date";
    fieldDefs[field] = { label: field, type };
  }
  return { asset, fieldDefs, sample };
}

async function loadUploadedCatalog(db: any) {
  const { rows } = await db.pool.query(`SELECT a.asset_id,a.title,a.fields,COALESCE(c.name,a.proposed_category) AS category FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id WHERE a.status='published' AND COALESCE(a.is_current,true)=true AND a.asset_type='structured' ORDER BY a.published_at DESC NULLS LAST,a.created_at DESC LIMIT 40`);
  return rows.map((a:any) => ({ asset_id:a.asset_id, title:a.title, category:a.category, fields:Array.isArray(a.fields)?a.fields:[] }));
}

async function planQuery(query: string, referenceContext: any, uploadedSchema?: any, uploadedCatalog: any[] = []) {
  const contextAssetId = cleanText(referenceContext?.asset_id);
  const contextDatasets = ASSET_TO_DATASETS[contextAssetId];
  const defs = contextDatasets ? contextDatasets.map(id => DATASETS[id]).filter(Boolean) : Object.values(DATASETS);
  const uploadedInfo = uploadedSchema
    ? `\n当前管理员上传结构化资料：asset_id=${uploadedSchema.asset.asset_id}，标题=${uploadedSchema.asset.title}，字段=${Object.entries(uploadedSchema.fieldDefs).map(([k,v]:any)=>`${k}(${v.type})`).join("；")}`
    : uploadedCatalog.length
      ? `\n当前可用管理员上传结构化资料（dataset必须写uploaded:后面的精确asset_id，禁止用标题冒充ID）：\n${uploadedCatalog.map((a:any)=>`- uploaded:${a.asset_id}，标题=${a.title}，分类=${a.category || ""}，字段=${a.fields.join("/")}`).join("\n")}` : "";
  const { text, model } = await callGateway([
    { role: "system", content: `你是黄林坑村治理AI的结构化查询规划器。你只负责把自然语言转换成受控 QuerySpec，不写SQL，不回答用户。\n\n可用系统数据集：\n${schemaPrompt(defs)}${uploadedInfo}\n\n允许操作符：eq,neq,gt,gte,lt,lte,between,in,contains,not_contains,is_null,not_null。允许聚合：count,count_distinct,sum,avg,min,max。\n\n硬规则：\n1. 必须完整保留用户说出的每一个实质查询约束：年龄、姓名、性别、村组、年度、金额、日期、状态、标签、地址、事件、政策领域等，禁止静默丢条件。\n2. 不得凭空增加用户没说的过滤条件。\n3. “70岁以上”只能理解为年龄>=70，绝不能把“岁以上/以上/的人数”等理解为姓名。\n4. 姓名只有在用户明确提到具体人名时才生成 name 过滤。\n5. “2组或3组”使用 in；“65到80岁”使用 between；“不是/不含”使用 neq/not_contains。\n6. 用户问“人数”时，people/welfare/evacuations/people_governance优先 count_distinct(person_id)，记录数才用 count；金额合计用 sum。\n7. 一个问题同时包含人口 + 养老 + 民政/关爱 + 应急等跨域“人员筛选”条件时，使用 people_governance；该数据集只用于人员去重计数或人员名单，不用于金额求和/平均值。\n7.1 用户要求名单/明细时 output=rows 或 both，并在select中保留相关字段。\n8. 当前有锁定资料时只能使用上方列出的对应dataset；管理员上传资料dataset写uploaded:<asset_id>，字段必须使用真实字段名。\n9. 如果用户表达无法由现有字段可靠表示，设置unsupported=true并说明原因，不要近似执行。\n10. 输出严格JSON，不要Markdown。\n\nJSON格式：{"dataset":"从上方可用dataset中选一个，或uploaded:<asset_id>","user_constraints":["逐条列出用户约束"],"filters":[{"field":"字段ID","op":"gte","value":70}],"aggregate":{"op":"count_distinct","field":"person_id"},"group_by":[],"select":[],"sort":[],"limit":200,"output":"summary|rows|both","unsupported":false,"unsupported_reason":""}` },
    { role: "user", content: `用户问题：${query}\n当前参考资料：${JSON.stringify(referenceContext || null)}` },
  ], true);
  return { raw: parseJsonObject(text), model };
}

async function critiqueSpec(query: string, spec: any, schemaText: string) {
  const { text, model } = await callGateway([
    { role: "system", content: `你是查询计划审计器。比较用户原话和QuerySpec，检查约束完整性。missing_constraints=用户说了但计划没表达；extra_constraints=计划凭空增加；ambiguous_constraints=多义或字段映射不确定。尤其检查年龄/姓名/性别/村组/金额/年份/日期/状态/标签/事件等任意组合。只有三项数组都为空时ok=true。输出严格JSON：{"ok":true,"missing_constraints":[],"extra_constraints":[],"ambiguous_constraints":[],"note":""}` },
    { role: "user", content: `用户问题：${query}\n可用Schema：${schemaText}\nQuerySpec：${JSON.stringify(spec)}` },
  ], true);
  return { audit: parseJsonObject(text), model };
}

function normalizeOp(op: unknown): Operator | null { const allowed: Operator[] = ["eq","neq","gt","gte","lt","lte","between","in","contains","not_contains","is_null","not_null"]; return allowed.includes(op as Operator) ? op as Operator : null; }
function typeAllows(type: FieldType, op: Operator) {
  if (["is_null","not_null"].includes(op)) return true;
  if (type === "number" || type === "date") return ["eq","neq","gt","gte","lt","lte","between","in"].includes(op);
  if (type === "enum") return ["eq","neq","in"].includes(op);
  if (type === "tags") return ["eq","neq","contains","not_contains","in"].includes(op);
  return ["eq","neq","in","contains","not_contains"].includes(op);
}

function validateSpec(spec: any, def?: DatasetDef, uploaded?: any) {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") return { ok:false, errors:["QuerySpec不是对象"] };
  const fieldMap: Record<string, any> = def?.fields || uploaded?.fieldDefs || {};
  if (!spec.dataset) errors.push("缺少dataset");
  if (!Array.isArray(spec.user_constraints)) errors.push("缺少user_constraints");
  if (!Array.isArray(spec.filters)) errors.push("filters必须是数组");
  for (const [i, f] of (spec.filters || []).entries()) {
    if (!fieldMap[f?.field]) { errors.push(`filter[${i}]未知字段:${f?.field}`); continue; }
    const op = normalizeOp(f?.op); if (!op) { errors.push(`filter[${i}]非法操作符:${f?.op}`); continue; }
    if (!typeAllows(fieldMap[f.field].type, op)) errors.push(`filter[${i}]字段类型${fieldMap[f.field].type}不支持${op}`);
    if (op === "between" && !(Array.isArray(f.values) && f.values.length === 2)) errors.push(`filter[${i}] between需要两个values`);
    if (op === "in" && !(Array.isArray(f.values) && f.values.length > 0)) errors.push(`filter[${i}] in需要values`);
    if (!["between","in","is_null","not_null"].includes(op) && f.value === undefined) errors.push(`filter[${i}]缺少value`);
  }
  if (spec.aggregate) {
    if (!["count","count_distinct","sum","avg","min","max"].includes(spec.aggregate.op)) errors.push("非法aggregate.op");
    if (spec.aggregate.field && !fieldMap[spec.aggregate.field]) errors.push(`aggregate未知字段:${spec.aggregate.field}`);
    if (["sum","avg"].includes(spec.aggregate.op) && fieldMap[spec.aggregate.field]?.type !== "number") errors.push(`${spec.aggregate.op}只能用于数字字段`);
  }
  if (def?.id === "people_governance" && spec.aggregate) {
    if (spec.aggregate.op !== "count_distinct" || spec.aggregate.field !== "person_id") errors.push("people_governance聚合只允许count_distinct(person_id)，避免一对多Join导致重复统计");
  }
  for (const f of spec.group_by || []) if (!fieldMap[f]) errors.push(`group_by未知字段:${f}`);
  for (const f of spec.select || []) if (!fieldMap[f]) errors.push(`select未知字段:${f}`);
  for (const s of spec.sort || []) if (!fieldMap[s?.field] || !["asc","desc"].includes(s?.direction)) errors.push(`非法sort:${JSON.stringify(s)}`);
  return { ok: errors.length === 0, errors };
}

function coerceValue(value: any, type: FieldType) {
  if (value === null || value === undefined) return value;
  if (type === "number") { const n = Number(String(value).replace(/,/g,"")); if (!Number.isFinite(n)) throw new Error(`INVALID_NUMBER:${value}`); return n; }
  if (type === "date") { const s = String(value).trim(); if (!/^\d{4}-\d{1,2}-\d{1,2}(?:[T\s].*)?$/.test(s) && !/^\d{4}$/.test(s)) throw new Error(`INVALID_DATE:${value}`); return s; }
  return String(value).trim();
}

function compileFilter(field: FieldDef, filter: Filter, params: any[]) {
  const op = filter.op, expr = field.expr;
  if (op === "is_null") return `${expr} IS NULL`;
  if (op === "not_null") return `${expr} IS NOT NULL`;
  if (op === "between") { const vals = (filter.values || []).map(v => coerceValue(v, field.type)); params.push(vals[0], vals[1]); return `${expr} BETWEEN $${params.length - 1} AND $${params.length}`; }
  if (op === "in") { const vals = (filter.values || []).map(v => coerceValue(v, field.type)); const placeholders = vals.map(v => { params.push(v); return `$${params.length}`; }); return `${expr} IN (${placeholders.join(",")})`; }
  const value = coerceValue(filter.value, field.type);
  if (op === "contains" || op === "not_contains") { params.push(`%${value}%`); return `${expr}::text ${op === "contains" ? "ILIKE" : "NOT ILIKE"} $${params.length}`; }
  params.push(value); const sqlOp: Record<string,string> = { eq:"=",neq:"<>",gt:">",gte:">=",lt:"<",lte:"<=" }; return `${expr} ${sqlOp[op]} $${params.length}`;
}

function compileBuiltIn(def: DatasetDef, spec: QuerySpec) {
  const params: any[] = [];
  const where = (spec.filters || []).map(f => compileFilter(def.fields[f.field], f, params));
  const groupBy = (spec.group_by || []).map(f => def.fields[f].expr);
  let selectSql = ""; const aliases: string[] = [];
  if (spec.aggregate) {
    const agg = spec.aggregate; let aggExpr = "COUNT(*)";
    if (agg.op === "count_distinct" && agg.field) aggExpr = `COUNT(DISTINCT ${def.fields[agg.field].expr})`;
    else if (["sum","avg","min","max"].includes(agg.op) && agg.field) aggExpr = `${agg.op.toUpperCase()}(${def.fields[agg.field].expr})`;
    const groupSelect = (spec.group_by || []).map(f => `${def.fields[f].expr} AS "${def.fields[f].label}"`);
    selectSql = [...groupSelect, `${aggExpr} AS "结果"`].join(","); aliases.push(...(spec.group_by || []).map(f => def.fields[f].label), "结果");
  } else {
    const selected = (spec.select && spec.select.length ? spec.select : def.defaultSelect).slice(0, 30);
    selectSql = selected.map(f => `${def.fields[f].expr} AS "${def.fields[f].label}"`).join(","); aliases.push(...selected.map(f => def.fields[f].label));
  }
  const sortSql = (spec.sort || []).map(s => `${def.fields[s.field].expr} ${s.direction.toUpperCase()}`).join(",");
  const limit = Math.min(500, Math.max(1, Number(spec.limit || (spec.aggregate ? 100 : 200))));
  const selectPrefix = !spec.aggregate && def.distinctRows ? "SELECT DISTINCT" : "SELECT";
  const sql = `${selectPrefix} ${selectSql} FROM ${def.from}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${groupBy.length ? ` GROUP BY ${groupBy.join(",")}` : ""}${sortSql ? ` ORDER BY ${sortSql}` : ""} LIMIT ${limit}`;
  return { sql, params, columns: aliases };
}

function comparable(value: any, type: FieldType) { if (value === null || value === undefined) return null; if (type === "number") return Number(String(value).replace(/,/g,"")); if (type === "date") return new Date(value).getTime(); return String(value); }
function rowMatches(row: any, filter: Filter, fieldType: FieldType) {
  const actual = comparable(row?.[filter.field], fieldType);
  if (filter.op === "is_null") return actual === null || actual === ""; if (filter.op === "not_null") return actual !== null && actual !== "";
  if (filter.op === "between") { const [a,b] = filter.values || []; const lo = comparable(a, fieldType), hi = comparable(b, fieldType); return actual !== null && actual >= (lo as any) && actual <= (hi as any); }
  if (filter.op === "in") return (filter.values || []).map(v => comparable(v, fieldType)).some(v => actual === v);
  const expected = comparable(filter.value, fieldType);
  if (filter.op === "contains") return String(actual ?? "").includes(String(expected ?? "")); if (filter.op === "not_contains") return !String(actual ?? "").includes(String(expected ?? ""));
  if (filter.op === "eq") return actual === expected; if (filter.op === "neq") return actual !== expected; if (filter.op === "gt") return actual !== null && actual > (expected as any); if (filter.op === "gte") return actual !== null && actual >= (expected as any); if (filter.op === "lt") return actual !== null && actual < (expected as any); if (filter.op === "lte") return actual !== null && actual <= (expected as any); return false;
}

async function executeUploaded(db: any, uploaded: any, spec: QuerySpec) {
  const { rows: records } = await db.pool.query(`SELECT data FROM data_asset_records WHERE asset_id=$1 ORDER BY row_no`, [uploaded.asset.asset_id]);
  let rows = records.map((x:any) => x.data).filter((row:any) => (spec.filters || []).every(f => rowMatches(row, f, uploaded.fieldDefs[f.field].type)));
  const groupBy = spec.group_by || [];
  if (spec.aggregate) {
    const groups = new Map<string, any[]>(); for (const row of rows) { const key = JSON.stringify(groupBy.map(f => row?.[f])); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(row); } if (!groupBy.length && !groups.size) groups.set("[]", []);
    const out: any[] = []; for (const [key, groupRows] of groups) { const obj: any = {}; const groupVals = JSON.parse(key); groupBy.forEach((f,i) => obj[f] = groupVals[i]); const agg = spec.aggregate; const vals = agg.field ? groupRows.map(r => Number(String(r?.[agg.field!]).replace(/,/g,""))).filter(Number.isFinite) : [];
      let result: any = groupRows.length; if (agg.op === "count_distinct" && agg.field) result = new Set(groupRows.map(r => r?.[agg.field!])).size; else if (agg.op === "sum") result = vals.reduce((a,b)=>a+b,0); else if (agg.op === "avg") result = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null; else if (agg.op === "min") result = vals.length ? Math.min(...vals) : null; else if (agg.op === "max") result = vals.length ? Math.max(...vals) : null; obj[agg.alias || "结果"] = result; out.push(obj); }
    rows = out;
  } else if (spec.select?.length) rows = rows.map((r:any) => Object.fromEntries(spec.select!.map(f => [f, r?.[f]])));
  rows = rows.slice(0, Math.min(500, Math.max(1, Number(spec.limit || 200))));
  return { rows, execution: { engine:"validated-js-filter", source_asset_id: uploaded.asset.asset_id } };
}

function humanFilter(def: DatasetDef | null, uploaded: any, f: Filter) {
  const label = def?.fields[f.field]?.label || uploaded?.fieldDefs?.[f.field]?.label || f.field;
  const opLabel: Record<string,string> = {eq:"=",neq:"≠",gt:">",gte:"≥",lt:"<",lte:"≤",between:"介于",in:"属于",contains:"包含",not_contains:"不包含",is_null:"为空",not_null:"非空"};
  const v = f.op === "between" || f.op === "in" ? JSON.stringify(f.values || []) : f.value; return `${label} ${opLabel[f.op] || f.op}${v === undefined ? "" : ` ${v}`}`;
}
function summarizeResult(spec: QuerySpec, rows: any[], def?: DatasetDef, uploaded?: any) {
  const title = def?.title || uploaded?.asset?.title || "参考数据";
  if (spec.aggregate) { if (rows.length === 1 && Object.keys(rows[0] || {}).length === 1) { const val = Object.values(rows[0])[0]; return { title, summary: `${title}查询结果：${val ?? 0}。`, facts: [{ label: spec.aggregate.alias || "结果", value: String(val ?? 0) }] }; } return { title, summary: `${title}查询得到 ${rows.length} 组聚合结果。`, facts: [{ label:"结果组数", value:`${rows.length} 组` }] }; }
  return { title, summary: `${title}查询到 ${rows.length} 条符合全部条件的记录。`, facts: [{ label:"记录数", value:`${rows.length} 条` }] };
}

async function handler(req: Request) {
  if (req.method !== "POST") return json({ ok:false, error:"method_not_allowed" }, { status:405 });
  const body: any = await req.json().catch(() => ({})); const query = cleanText(body.query); const referenceContext = body.reference_context && typeof body.reference_context === "object" ? body.reference_context : null;
  if (!query) return json({ ok:false, error:"query_required", message:"请输入查询问题。" }, { status:400 });
  const db = getDatabase(); const contextAssetId = cleanText(referenceContext?.asset_id); let uploaded: any = null;
  if (contextAssetId && !ASSET_TO_DATASETS[contextAssetId]) uploaded = await loadUploadedSchema(db, contextAssetId);
  const uploadedCatalog = !contextAssetId ? await loadUploadedCatalog(db).catch(() => []) : [];
  let planned: any;
  try { planned = await planQuery(query, referenceContext, uploaded, uploadedCatalog); }
  catch { return json({ ok:true, model:{mode:"queryspec-unavailable",name:"none",gateway:false}, plan:{intent:"clarify",domains:[],steps:[],detail:false,note:"查询规划模型不可用"}, result:{kind:"clarify",domain:"意图确认",title:"暂时无法安全生成查询计划",summary:"当前无法可靠理解这条组合查询，因此没有执行数据库查询。请稍后重试。",facts:[],rows:[],columns:[],recordRows:[],filters:[],evidence:[],tools:[],no_database_query:true}, narrative:"当前无法可靠理解这条组合查询，因此没有执行数据库查询。请稍后重试。", generated_at:new Date().toISOString() }); }
  const raw = planned.raw || {};
  if (raw.unsupported) { const msg = cleanText(raw.unsupported_reason) || "当前数据字段不足以可靠表达这条查询。"; return json({ ok:true, model:{mode:"queryspec-planner",name:planned.model,gateway:true}, plan:{intent:"clarify",domains:[],steps:[],detail:false,note:"QuerySpec标记为unsupported"}, result:{kind:"clarify",domain:"意图确认",title:"这条查询需要进一步确认",summary:msg,facts:[],rows:[],columns:[],recordRows:[],filters:[],evidence:[],tools:[],no_database_query:true}, narrative:msg, generated_at:new Date().toISOString() }); }

  const datasetId = cleanText(raw.dataset); let def: DatasetDef | undefined;
  if (datasetId.startsWith("uploaded:")) { const id = datasetId.slice("uploaded:".length); if (!uploaded || uploaded.asset.asset_id !== id) { try { uploaded = await loadUploadedSchema(db, id); } catch {} } } else def = DATASETS[datasetId];
  const validation = validateSpec(raw, def, uploaded);
  if (!validation.ok || (!def && !uploaded)) { const msg = `查询计划校验未通过：${validation.errors.join("；") || "未知数据集"}。本次没有执行数据库查询。`; return json({ ok:true, model:{mode:"queryspec-validator",name:planned.model,gateway:true}, plan:{intent:"clarify",domains:[],steps:[],detail:false,note:"Schema/类型校验失败",validator:validation}, result:{kind:"clarify",domain:"意图确认",title:"查询计划未通过安全校验",summary:msg,facts:[],rows:[],columns:[],recordRows:[],filters:[],evidence:[],tools:[],no_database_query:true}, narrative:msg, generated_at:new Date().toISOString() }); }

  let critique: any;
  try { const schemaText = def ? schemaPrompt([def]) : `uploaded:${uploaded.asset.asset_id} fields=${Object.entries(uploaded.fieldDefs).map(([k,v]:any)=>`${k}(${v.type})`).join(";")}`; critique = await critiqueSpec(query, raw, schemaText); }
  catch { critique = { audit:{ok:false,missing_constraints:[],extra_constraints:[],ambiguous_constraints:["约束完整性审计模型不可用"],note:"为了避免静默丢条件，本次不执行"}, model:"none" }; }
  const audit = critique.audit || {};
  if (!audit.ok || (audit.missing_constraints || []).length || (audit.extra_constraints || []).length || (audit.ambiguous_constraints || []).length) {
    const problems = [...(audit.missing_constraints || []).map((x:string)=>`遗漏：${x}`), ...(audit.extra_constraints || []).map((x:string)=>`多加：${x}`), ...(audit.ambiguous_constraints || []).map((x:string)=>`不确定：${x}`)];
    const msg = `我没有执行这次查询，因为查询条件还没有被完整、唯一地映射：${problems.join("；") || cleanText(audit.note) || "需要确认条件"}。`;
    return json({ ok:true, model:{mode:"queryspec-constraint-check",name:critique.model,gateway:critique.model!=="none"}, plan:{intent:"clarify",domains:[def?.title || uploaded?.asset?.title].filter(Boolean),steps:[],detail:false,note:"Constraint Completeness未通过",query_spec:raw,constraint_audit:audit}, result:{kind:"clarify",domain:"意图确认",title:"需要确认查询条件",summary:msg,facts:[],rows:[],columns:[],recordRows:[],filters:[],evidence:[],tools:[],no_database_query:true}, narrative:msg, generated_at:new Date().toISOString() });
  }

  let rows: any[] = [], execution: any = {};
  if (def) { const compiled = compileBuiltIn(def, raw as QuerySpec); const result = await db.pool.query(compiled.sql, compiled.params); rows = result.rows; execution = { engine:"parameterized-sql", sql:compiled.sql, params:compiled.params, columns:compiled.columns }; }
  else { const result = await executeUploaded(db, uploaded, raw as QuerySpec); rows = result.rows; execution = result.execution; }

  const summary = summarizeResult(raw as QuerySpec, rows, def, uploaded); const effectiveFilters = (raw.filters || []).map((f:Filter) => humanFilter(def || null, uploaded, f)); const evidence = [def?.title || uploaded?.asset?.title].filter(Boolean);
  const resultKind = def ? `${def.id}_query` : "reference_dataset_query"; const displayRows = raw.output === "summary" ? [] : rows.slice(0, 200);
  let narrative = summary.summary, answerModel = "none";
  try { const model = await callGateway([{ role:"system", content:"你是黄林坑村治理智能助手。只根据已经通过校验并由数据库执行得到的结果回答。不得新增事实，不得改变数字。先直接回答，再用最多3条补充说明。" }, { role:"user", content:`用户问题：${query}\n已验证查询条件：${JSON.stringify(effectiveFilters)}\n数据库结果：${JSON.stringify({summary:summary.summary,facts:summary.facts,rows:rows.slice(0,30)})}` }]); if (model.text) narrative = model.text; answerModel = model.model; } catch {}

  const plan = { intent:"data", domains:[def?.title || uploaded?.asset?.title].filter(Boolean), steps:[{ tool:"structured_query_kernel", params:{ dataset:raw.dataset, source_asset_id:def?.source || uploaded?.asset?.asset_id, recognized_constraints:raw.user_constraints || [], effective_filters:effectiveFilters, aggregate:raw.aggregate || null, group_by:raw.group_by || [], select:raw.select || [], sort:raw.sort || [], execution } }], detail:displayRows.length > 0, note:"QuerySpec → Schema校验 → Constraint Completeness → 确定性执行", query_spec:raw, constraint_audit:audit };
  try { await db.pool.query(`INSERT INTO audit_logs(actor,original_query,model_mode,model_name,plan,result_summary) VALUES('demo-user',$1,$2,$3,$4::jsonb,$5)`, [query,"queryspec-v052",answerModel || planned.model,JSON.stringify(plan),summary.summary]); } catch {}
  return json({ ok:true, model:{mode:"queryspec-v052",name:answerModel || planned.model,gateway:true,planner:planned.model,critic:critique.model}, plan, result:{kind:resultKind,domain:def?.title || uploaded?.asset?.category || "参考数据",title:summary.title,summary:summary.summary,facts:summary.facts,rows:displayRows,columns:rows[0]?Object.keys(rows[0]):[],recordRows:rows,filters:effectiveFilters,evidence,tools:[{name:"structured_query_kernel",desc:"V0.5.2 受控结构化查询内核"}]}, narrative, generated_at:new Date().toISOString() });
}

export default async (req: Request, _context: Context) => { try { return await handler(req); } catch (e:any) { console.error("structured query error", e); return json({ ok:false, error:"structured_query_failed", message:e?.message || "结构化查询执行失败。" }, { status:500 }); } };
export const config: Config = { path: "/api/query-v052-exec" };
