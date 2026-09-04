import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getDeployStore, getStore } from "@netlify/blobs";
import * as XLSX from "xlsx";

const AS_OF = "2026-09-04";
const MODEL_DEFAULT = "gpt-4.1-mini";
const SOURCE_STORE = "governance-source";

const BUILTIN_ASSETS: Record<string, any> = {
  "sys-people": {
    asset_id: "sys-people", title: "人口基础台账", category: "人口与家庭", asset_type: "structured",
    source: "黄林坑村人口基础台账（Demo）", description: "黄林坑村在册村民基础名册",
    fields: ["人员ID","姓名","性别","出生日期","年龄","村组","家庭ID","家庭地址","特殊标签","风险标签"], system: true,
  },
  "sys-households": {
    asset_id: "sys-households", title: "家庭户台账", category: "人口与家庭", asset_type: "structured",
    source: "黄林坑村家庭户台账（Demo）", description: "家庭户、房屋结构与风险信息",
    fields: ["家庭ID","村组","家庭地址","房屋结构","风险等级","地理风险","备注"], system: true,
  },
  "sys-pension": {
    asset_id: "sys-pension", title: "养老保险缴费台账", category: "养老保险", asset_type: "structured",
    source: "城乡居民养老保险业务台账（Demo）", description: "2024—2026年度养老保险缴费明细",
    fields: ["姓名","村组","年度","缴费状态","缴费档次","实缴金额","缴费日期","补贴金额"], system: true,
  },
  "sys-welfare": {
    asset_id: "sys-welfare", title: "民政与关爱台账", category: "民政与关爱", asset_type: "structured",
    source: "民政与关爱业务台账（Demo）", description: "低保、独居、高龄、行动不便与临时救助记录",
    fields: ["姓名","村组","关爱事项","状态","开始日期","结束日期","备注"], system: true,
  },
  "sys-evacuations": {
    asset_id: "sys-evacuations", title: "应急转移安置台账", category: "应急防灾", asset_type: "structured",
    source: "应急转移安置台账（Demo）", description: "防汛防台等事件中的人员转移安置记录",
    fields: ["事件","姓名","村组","转移时间","安置地点","转移原因","返回时间","状态"], system: true,
  },
  "sys-expenses": {
    asset_id: "sys-expenses", title: "应急费用台账", category: "应急防灾", asset_type: "structured",
    source: "应急费用台账（Demo）", description: "应急事件已登记费用记录",
    fields: ["事件","费用类别","摘要","日期","金额","核验状态"], system: true,
  },
  "sys-policies": {
    asset_id: "sys-policies", title: "政策文件库", category: "政策文件", asset_type: "structured",
    source: "政策文件库（Demo）", description: "养老、民政、应急等演示政策文件",
    fields: ["政策领域","标题","发布日期","生效日期","状态","适用对象","摘要","关键条款"], system: true,
  },
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "人口与家庭": "人口、家庭与村组基础资料",
  "养老保险": "养老保险账户、缴费与待遇资料",
  "民政与关爱": "低保、独居、高龄、残疾与救助资料",
  "应急防灾": "防汛防台、人员转移、费用与干部参与资料",
  "政策文件": "政策、通知、办法与业务依据",
};

function sourceStore() {
  if (Netlify.context?.deploy.context === "production") return getStore(SOURCE_STORE, { consistency: "strong" });
  return getDeployStore(SOURCE_STORE);
}

function env(name: string) {
  try { return Netlify.env.get(name); } catch { return undefined; }
}

function json(data: any, init: ResponseInit = {}) {
  return Response.json(data, init);
}

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function safeFilename(value: string) {
  return String(value || "file").replace(/[\r\n"\\/]/g, "_");
}

function aiReady(asset: any) {
  return asset?.asset_type === "structured" || cleanText(asset?.searchable_text).length > 0;
}

async function callGateway(messages: any[], jsonMode = false) {
  const apiKey = env("OPENAI_API_KEY");
  const baseUrl = env("OPENAI_BASE_URL");
  const model = env("HLK_MODEL") || MODEL_DEFAULT;
  if (!apiKey || !baseUrl) throw new Error("AI_GATEWAY_UNAVAILABLE");
  const body: any = { model, messages };
  if (jsonMode) body.response_format = { type: "json_object" };
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`AI_GATEWAY_${resp.status}`);
  const data: any = await resp.json();
  return { text: cleanText(data.choices?.[0]?.message?.content), model };
}

function classifyAsset(name: string, fields: string[], text: string) {
  const haystack = `${name} ${fields.join(" ")} ${text.slice(0, 4000)}`;
  const rules = [
    ["养老保险", /养老|缴费|参保|待遇|养老金/],
    ["民政与关爱", /低保|民政|救助|独居|高龄|残疾|关爱/],
    ["应急防灾", /台风|防汛|防灾|应急|转移|安置|避险|费用/],
    ["政策文件", /政策|通知|办法|规定|条例|方案|实施意见/],
    ["人口与家庭", /人口|村民|家庭|户籍|姓名|身份证|出生|住址/],
  ] as const;
  for (const [category, re] of rules) if (re.test(haystack)) return { category, confidence: 0.9, source: "规则分类" };
  return { category: "其他资料", confidence: 0.55, source: "规则分类" };
}

function isStructuredFile(name: string, mime: string) {
  return /\.(xlsx?|csv|json)$/i.test(name) || /spreadsheet|excel|csv|json/i.test(mime);
}

async function parseStructured(file: File) {
  const name = file.name || "upload";
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "json") {
    const parsed = JSON.parse(await file.text());
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [parsed];
    return { rows: rows.filter((x: any) => x && typeof x === "object" && !Array.isArray(x)), fields: rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]) : [] };
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  return { rows, fields: rows[0] ? Object.keys(rows[0]) : [] };
}

async function ensureCategories(db: any) {
  for (const [name, description] of Object.entries(CATEGORY_DESCRIPTIONS)) {
    await db.pool.query(`INSERT INTO reference_categories(name,description) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description`, [name, description]);
  }
}

async function builtinRows(db: any, id: string, limit: number, offset: number) {
  let sql = "";
  if (id === "sys-people") sql = `SELECT p.person_id AS "人员ID",p.name AS "姓名",p.gender AS "性别",p.birth_date AS "出生日期",EXTRACT(YEAR FROM age($1::date,p.birth_date))::int AS "年龄",h.village_group AS "村组",h.household_id AS "家庭ID",h.address AS "家庭地址",p.special_tags AS "特殊标签",p.risk_tags AS "风险标签" FROM people p LEFT JOIN households h ON h.household_id=p.household_id ORDER BY h.village_group,p.person_id`;
  else if (id === "sys-households") sql = `SELECT household_id AS "家庭ID",village_group AS "村组",address AS "家庭地址",house_structure AS "房屋结构",risk_level AS "风险等级",geo_risk AS "地理风险",notes AS "备注" FROM households ORDER BY village_group,household_id`;
  else if (id === "sys-pension") sql = `SELECT p.name AS "姓名",h.village_group AS "村组",pp.year AS "年度",pp.payment_status AS "缴费状态",pp.tier_amount AS "缴费档次",pp.paid_amount AS "实缴金额",pp.payment_date AS "缴费日期",pp.subsidy_amount AS "补贴金额" FROM pension_payments pp JOIN people p ON p.person_id=pp.person_id LEFT JOIN households h ON h.household_id=p.household_id ORDER BY pp.year DESC,h.village_group,p.person_id`;
  else if (id === "sys-welfare") sql = `SELECT p.name AS "姓名",h.village_group AS "村组",w.welfare_type AS "关爱事项",w.status AS "状态",w.start_date AS "开始日期",w.end_date AS "结束日期",w.notes AS "备注" FROM welfare_records w JOIN people p ON p.person_id=w.person_id LEFT JOIN households h ON h.household_id=p.household_id ORDER BY h.village_group,p.person_id,w.start_date`;
  else if (id === "sys-evacuations") sql = `SELECT ev.event_name AS "事件",p.name AS "姓名",h.village_group AS "村组",e.evacuation_time AS "转移时间",e.shelter AS "安置地点",e.reason AS "转移原因",e.return_time AS "返回时间",e.status AS "状态" FROM evacuations e JOIN events ev ON ev.event_id=e.event_id JOIN people p ON p.person_id=e.person_id LEFT JOIN households h ON h.household_id=p.household_id ORDER BY ev.start_time DESC,h.village_group,p.person_id`;
  else if (id === "sys-expenses") sql = `SELECT ev.event_name AS "事件",x.category AS "费用类别",x.summary AS "摘要",x.expense_date AS "日期",x.amount AS "金额",x.verification_status AS "核验状态" FROM expenses x JOIN events ev ON ev.event_id=x.event_id ORDER BY ev.start_time DESC,x.expense_date,x.expense_id`;
  else if (id === "sys-policies") sql = `SELECT domain AS "政策领域",title AS "标题",published_date AS "发布日期",effective_date AS "生效日期",status AS "状态",applicable_to AS "适用对象",summary AS "摘要",clauses AS "关键条款" FROM policies ORDER BY published_date DESC,title`;
  else throw new Error("UNKNOWN_BUILTIN_ASSET");
  const countSql = `SELECT COUNT(*)::int AS n FROM (${sql}) q`;
  const baseParams = id === "sys-people" ? [AS_OF] : [];
  const { rows: countRows } = await db.pool.query(countSql, baseParams);
  const { rows } = await db.pool.query(`${sql} LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`, [...baseParams, limit, offset]);
  return { rows, total: countRows[0]?.n || 0 };
}

async function referenceAsset(db: any, id: string, page: number, limit: number) {
  if (BUILTIN_ASSETS[id]) {
    const { rows, total } = await builtinRows(db, id, limit, (page - 1) * limit);
    return { asset: { ...BUILTIN_ASSETS[id], record_count: total }, rows, total, page, limit };
  }
  const { rows: assets } = await db.pool.query(`SELECT a.*,COALESCE(c.name,a.proposed_category) AS category,d.canonical_title AS dataset_title FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id LEFT JOIN reference_datasets d ON d.dataset_id=a.dataset_id WHERE a.asset_id=$1 AND a.status='published' LIMIT 1`, [id]);
  const a = assets[0];
  if (!a) return null;
  let rows: any[] = [];
  let total = 0;
  if (a.asset_type === "structured") {
    const { rows: c } = await db.pool.query(`SELECT COUNT(*)::int AS n FROM data_asset_records WHERE asset_id=$1`, [id]);
    total = c[0]?.n || 0;
    const r = await db.pool.query(`SELECT data FROM data_asset_records WHERE asset_id=$1 ORDER BY row_no LIMIT $2 OFFSET $3`, [id, limit, (page - 1) * limit]);
    rows = r.rows.map((x: any) => x.data);
  }
  return {
    asset: {
      asset_id: a.asset_id, dataset_id: a.dataset_id, dataset_title: a.dataset_title || a.title, title: a.title,
      category: a.category, asset_type: a.asset_type, source: a.source_file_name, description: a.description,
      fields: a.fields || [], record_count: a.record_count, searchable_text: a.searchable_text || "", version_label: a.version_label,
      system: false, ai_ready: aiReady(a),
    }, rows, total, page, limit,
  };
}

function queryFilters(query: string) {
  const year = query.match(/20\d{2}/)?.[0];
  const minAge = query.match(/(\d{2,3})\s*岁(?:以上|及以上|起)/)?.[1];
  const group = query.match(/([1-9]\d*)组/)?.[1];
  const name = query.match(/(?:查|看|查询|看看|关于)?\s*([\u4e00-\u9fa5]{2,4})(?:的|过去|历年|养老|缴费|情况)/)?.[1];
  return { year: year ? Number(year) : undefined, minAge: minAge ? Number(minAge) : undefined, group: group ? `${group}组` : undefined, name };
}

async function runBuiltinQuery(db: any, query: string, context?: any) {
  const q = query;
  const f = queryFilters(q);
  const contextId = cleanText(context?.asset_id);
  if (contextId === "sys-pension" || /养老|缴费|参保|待遇/.test(q)) {
    const params: any[] = [];
    const where = ["1=1"];
    if (f.year) { params.push(f.year); where.push(`pp.year=$${params.length}`); }
    if (/未缴/.test(q)) where.push(`pp.payment_status='未缴'`);
    if (/已缴/.test(q) && !/未缴/.test(q)) where.push(`pp.payment_status='已缴'`);
    if (f.name) { params.push(f.name); where.push(`p.name=$${params.length}`); }
    const { rows } = await db.pool.query(`SELECT p.name AS "姓名",h.village_group AS "村组",pp.year AS "年度",pp.payment_status AS "缴费状态",pp.tier_amount AS "缴费档次",pp.paid_amount AS "实缴金额",pp.payment_date AS "缴费日期",pp.subsidy_amount AS "补贴金额" FROM pension_payments pp JOIN people p ON p.person_id=pp.person_id LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ORDER BY pp.year DESC,h.village_group,p.name`, params);
    return { kind: "pension_stats", domain: "养老保险", title: "养老保险查询结果", summary: `查询到 ${rows.length} 条养老保险缴费记录。`, facts: [{ label: "记录数", value: `${rows.length} 条` }], rows: /谁|哪些|名单|明细|具体|记录|历史/.test(q) ? rows.slice(0, 200) : [], columns: BUILTIN_ASSETS["sys-pension"].fields, recordRows: rows, filters: [f.year ? `年度=${f.year}` : "全部年度"], evidence: ["养老保险缴费台账"], tools: [{ name: "pension_query", desc: "养老保险缴费表只读查询" }] };
  }
  if (contextId === "sys-welfare" || /低保|独居|高龄|关爱|救助|行动不便|民政/.test(q)) {
    const params: any[] = [];
    const where = ["1=1"];
    const type = /低保/.test(q) ? "最低生活保障" : /独居/.test(q) ? "独居老人关爱" : /高龄/.test(q) ? "高龄老人关爱" : /行动不便|残疾/.test(q) ? "残疾/行动不便关爱" : /救助/.test(q) ? "临时救助" : undefined;
    if (type) { params.push(type); where.push(`w.welfare_type=$${params.length}`); }
    if (f.group) { params.push(f.group); where.push(`h.village_group=$${params.length}`); }
    const { rows } = await db.pool.query(`SELECT p.name AS "姓名",h.village_group AS "村组",w.welfare_type AS "关爱事项",w.status AS "状态",w.start_date AS "开始日期",w.end_date AS "结束日期",w.notes AS "备注" FROM welfare_records w JOIN people p ON p.person_id=w.person_id LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ORDER BY h.village_group,p.name`, params);
    return { kind: "welfare_query", domain: "民政与关爱", title: "民政与关爱查询结果", summary: `查询到 ${rows.length} 条符合条件的关爱记录。`, facts: [{ label: "记录数", value: `${rows.length} 条` }], rows: /谁|哪些|名单|明细|具体/.test(q) ? rows : [], columns: BUILTIN_ASSETS["sys-welfare"].fields, recordRows: rows, filters: type ? [`关爱事项=${type}`] : [], evidence: ["民政与关爱台账"], tools: [{ name: "welfare_query", desc: "民政关爱台账只读查询" }] };
  }
  if (contextId === "sys-evacuations" || contextId === "sys-expenses" || /台风|防汛|转移|安置|应急|费用|花了|支出/.test(q)) {
    const eventCond = /上一次|上次|最近|上一回/.test(q) ? `AND ev.event_id=(SELECT event_id FROM events WHERE event_type='台风' ORDER BY start_time DESC LIMIT 1)` : "";
    if (/费用|花了|支出|金额/.test(q) || contextId === "sys-expenses") {
      const { rows } = await db.pool.query(`SELECT ev.event_name AS "事件",x.category AS "费用类别",x.summary AS "摘要",x.expense_date AS "日期",x.amount AS "金额",x.verification_status AS "核验状态" FROM expenses x JOIN events ev ON ev.event_id=x.event_id WHERE 1=1 ${eventCond} ORDER BY ev.start_time DESC,x.expense_date`);
      const verified = rows.filter((r: any) => r["核验状态"] === "已核验");
      const total = verified.reduce((s: number, r: any) => s + Number(r["金额"] || 0), 0);
      return { kind: "emergency_expenses", domain: "应急防灾", title: "应急费用查询结果", summary: `共查询到 ${rows.length} 条费用记录，已核验金额合计 ${total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} 元。`, facts: [{ label: "已核验金额", value: `${total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} 元` }, { label: "费用记录", value: `${rows.length} 条` }], rows: /明细|哪些|记录|列出/.test(q) ? rows : [], columns: BUILTIN_ASSETS["sys-expenses"].fields, recordRows: rows, filters: eventCond ? ["最近一次台风事件"] : [], evidence: ["应急费用台账"], tools: [{ name: "emergency_expense_query", desc: "应急费用台账只读查询" }] };
    }
    const params: any[] = [];
    const where = ["1=1"];
    if (f.minAge) { params.push(f.minAge); where.push(`EXTRACT(YEAR FROM age(ev.start_time,p.birth_date))::int >= $${params.length}`); }
    const { rows } = await db.pool.query(`SELECT ev.event_name AS "事件",p.name AS "姓名",EXTRACT(YEAR FROM age(ev.start_time,p.birth_date))::int AS "当时年龄",h.village_group AS "村组",h.address AS "家庭地址",e.evacuation_time AS "转移时间",e.shelter AS "安置地点",e.reason AS "转移原因",e.return_time AS "返回时间",e.status AS "状态" FROM evacuations e JOIN events ev ON ev.event_id=e.event_id JOIN people p ON p.person_id=e.person_id LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ${eventCond} ORDER BY ev.start_time DESC,h.village_group,p.name`, params);
    return { kind: "emergency_event", domain: "应急防灾", title: "应急转移查询结果", summary: `查询到 ${rows.length} 条人员转移记录。`, facts: [{ label: "转移记录", value: `${rows.length} 条` }], rows: /谁|哪些|名单|明细|具体/.test(q) ? rows : [], columns: ["事件","姓名","当时年龄","村组","家庭地址","转移时间","安置地点","转移原因","返回时间","状态"], recordRows: rows, filters: [eventCond ? "最近一次台风事件" : "全部事件", f.minAge ? `当时年龄≥${f.minAge}` : ""].filter(Boolean), evidence: ["应急转移安置台账"], tools: [{ name: "emergency_query", desc: "应急转移台账只读查询" }] };
  }
  if (contextId === "sys-policies" || /政策|规定|条款|依据|办法/.test(q)) {
    const tokens = q.split(/[，。！？、\s]+/).filter((x) => x.length >= 2).slice(0, 8);
    const params: any[] = [];
    const clauses: string[] = [];
    for (const t of tokens) { params.push(`%${t}%`); clauses.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length} OR applicable_to ILIKE $${params.length})`); }
    const { rows } = await db.pool.query(`SELECT domain AS "政策领域",title AS "标题",published_date AS "发布日期",effective_date AS "生效日期",status AS "状态",applicable_to AS "适用对象",summary AS "摘要",clauses AS "关键条款" FROM policies ${clauses.length ? `WHERE ${clauses.join(" OR ")}` : ""} ORDER BY published_date DESC`, params);
    return { kind: "policy_search", domain: "政策文件", title: "政策检索结果", summary: `匹配到 ${rows.length} 份政策文件。`, facts: [{ label: "匹配文件", value: `${rows.length} 份` }], rows, columns: BUILTIN_ASSETS["sys-policies"].fields, recordRows: rows, filters: tokens.map((x) => `关键词=${x}`), evidence: ["政策文件库"], tools: [{ name: "policy_search", desc: "政策文件库只读检索" }] };
  }
  const params: any[] = [AS_OF];
  const where = ["1=1"];
  if (f.minAge) { params.push(f.minAge); where.push(`EXTRACT(YEAR FROM age($1::date,p.birth_date))::int >= $${params.length}`); }
  if (f.group) { params.push(f.group); where.push(`h.village_group=$${params.length}`); }
  if (f.name) { params.push(f.name); where.push(`p.name=$${params.length}`); }
  const { rows } = await db.pool.query(`SELECT p.person_id AS "人员ID",p.name AS "姓名",p.gender AS "性别",p.birth_date AS "出生日期",EXTRACT(YEAR FROM age($1::date,p.birth_date))::int AS "年龄",h.village_group AS "村组",h.household_id AS "家庭ID",h.address AS "家庭地址",p.special_tags AS "特殊标签",p.risk_tags AS "风险标签" FROM people p LEFT JOIN households h ON h.household_id=p.household_id WHERE ${where.join(" AND ")} ORDER BY h.village_group,p.name`, params);
  return { kind: "person_filter", domain: "人口与家庭", title: "人口与家庭查询结果", summary: `符合条件的人员共 ${rows.length} 人。`, facts: [{ label: "符合条件人数", value: `${rows.length} 人` }], rows: /谁|哪些|名单|明细|具体|姓名/.test(q) ? rows : [], columns: BUILTIN_ASSETS["sys-people"].fields, recordRows: rows, filters: [f.minAge ? `年龄≥${f.minAge}` : "", f.group ? `村组=${f.group}` : ""].filter(Boolean), evidence: ["人口基础台账"], tools: [{ name: "person_filter", desc: "人口与家庭台账只读查询" }] };
}

async function uploadedStructuredQuery(db: any, assetId: string, query: string) {
  const { rows: assets } = await db.pool.query(`SELECT a.*,COALESCE(c.name,a.proposed_category) AS category FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id WHERE a.asset_id=$1 AND a.status='published' LIMIT 1`, [assetId]);
  const asset = assets[0];
  if (!asset) throw new Error("REFERENCE_ASSET_NOT_FOUND");
  if (asset.asset_type !== "structured") throw new Error("DOCUMENT_QUERY_REQUIRES_DOCUMENT_ROUTE");
  const { rows: records } = await db.pool.query(`SELECT data FROM data_asset_records WHERE asset_id=$1 ORDER BY row_no`, [assetId]);
  let rows = records.map((x: any) => x.data);
  const tokens = query.match(/[A-Za-z0-9_.%-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const useful = tokens.filter((x) => !/基于|参考数据|资料|查询|看看|这个|这份|多少|哪些|什么|情况/.test(x)).slice(0, 12);
  if (useful.length) {
    const filtered = rows.filter((row: any) => {
      const text = JSON.stringify(row).toLowerCase();
      return useful.some((t) => text.includes(t.toLowerCase()));
    });
    if (filtered.length) rows = filtered;
  }
  return { kind: "reference_dataset_query", domain: asset.category || "参考数据", title: asset.title, summary: `在“${asset.title}”中查询到 ${rows.length} 条相关记录。`, facts: [{ label: "相关记录", value: `${rows.length} 条` }], rows: /明细|哪些|记录|列出|具体|谁/.test(query) ? rows.slice(0, 200) : [], columns: asset.fields || (rows[0] ? Object.keys(rows[0]) : []), recordRows: rows, filters: useful.map((x) => `关键词=${x}`), evidence: [asset.source_file_name], tools: [{ name: "reference_dataset_query", desc: `已发布结构化资料 · asset_id=${asset.asset_id}` }] };
}

async function queryHandler(req: Request) {
  const body: any = await req.json().catch(() => ({}));
  const query = cleanText(body.query);
  const referenceContext = body.reference_context && typeof body.reference_context === "object" ? body.reference_context : null;
  if (!query) return json({ ok: false, error: "query_required", message: "请输入查询问题。" }, { status: 400 });
  const db = getDatabase();
  let result: any;
  const contextId = cleanText(referenceContext?.asset_id);
  try {
    if (contextId && !BUILTIN_ASSETS[contextId]) result = await uploadedStructuredQuery(db, contextId, query);
    else result = await runBuiltinQuery(db, query, referenceContext);
  } catch (e: any) {
    result = { kind: "data_gap", domain: referenceContext?.category || "综合查询", title: "当前无法可靠回答", summary: e?.message === "REFERENCE_ASSET_NOT_FOUND" ? "当前参考资料未发布或已不存在。" : "当前数据不足以可靠回答这个问题。", facts: [], rows: [], columns: [], recordRows: [], gap: true, filters: [cleanText(e?.message || "DATA_GAP")], evidence: [], tools: [{ name: "data_gap", desc: "未找到可靠数据依据" }] };
  }
  let narrative = result.summary;
  let modelMode = "rule-engine";
  let modelName = "none";
  try {
    const model = await callGateway([
      { role: "system", content: "你是黄林坑村治理智能助手。只能依据后续给出的数据库查询结果回答，不得编造额外事实。用简洁中文总结；如果数据为空或标记 gap，明确说明无法可靠回答。" },
      { role: "user", content: `用户问题：${query}\n数据库结果：${JSON.stringify({ summary: result.summary, facts: result.facts, rows: result.rows?.slice?.(0, 30), filters: result.filters, evidence: result.evidence }, null, 2)}` },
    ]);
    if (model.text) narrative = model.text;
    modelMode = "netlify-ai-gateway";
    modelName = model.model;
  } catch {}
  const plan = { intent: result.gap ? "gap" : "data", domains: [result.domain].filter(Boolean), steps: result.tools?.map((x: any) => ({ tool: x.name, params: contextId ? { asset_id: contextId } : {} })) || [], detail: !!result.rows?.length, note: "只读查询已发布数据" };
  try { await db.pool.query(`INSERT INTO audit_logs(actor,original_query,model_mode,model_name,plan,result_summary) VALUES('demo-user',$1,$2,$3,$4::jsonb,$5)`, [query, modelMode, modelName, JSON.stringify(plan), result.summary]); } catch {}
  return json({ ok: true, model: { mode: modelMode, name: modelName, gateway: modelMode === "netlify-ai-gateway" }, plan, result, narrative, generated_at: new Date().toISOString() });
}

async function statusHandler() {
  const db = getDatabase();
  const names = ["people","households","pension_payments","welfare_records","events","evacuations","expenses","policies"];
  const counts: Record<string, number> = {};
  for (const name of names) {
    try { const { rows } = await db.pool.query(`SELECT COUNT(*)::int AS n FROM ${name}`); counts[name] = rows[0]?.n || 0; }
    catch { counts[name] = 0; }
  }
  return json({ ok: true, version: "0.5.0", as_of: AS_OF, counts, data_mode: "read-only published data" });
}

async function auditHandler() {
  const db = getDatabase();
  const { rows } = await db.pool.query(`SELECT id,actor,original_query,model_mode,model_name,plan,result_summary,created_at FROM audit_logs ORDER BY id DESC LIMIT 100`);
  return json({ ok: true, rows });
}

async function referenceCategoriesHandler() {
  const db = getDatabase();
  await ensureCategories(db);
  const { rows } = await db.pool.query(`SELECT c.category_id,c.name,c.description,COUNT(a.asset_id) FILTER (WHERE a.status='published' AND COALESCE(a.is_current,true)=true)::int AS uploaded_assets FROM reference_categories c LEFT JOIN data_assets a ON a.category_id=c.category_id GROUP BY c.category_id,c.name,c.description ORDER BY c.category_id`);
  const builtinCounts: Record<string, number> = {};
  for (const a of Object.values(BUILTIN_ASSETS)) builtinCounts[a.category] = (builtinCounts[a.category] || 0) + 1;
  const out = rows.map((r: any) => ({ ...r, uploaded_assets: r.uploaded_assets || 0, total_assets: (r.uploaded_assets || 0) + (builtinCounts[r.name] || 0) }));
  const existing = new Set(out.map((x: any) => x.name));
  for (const [name, description] of Object.entries(CATEGORY_DESCRIPTIONS)) if (!existing.has(name)) out.push({ name, description, uploaded_assets: 0, total_assets: builtinCounts[name] || 0 });
  return json({ ok: true, rows: out });
}

async function referenceAssetsHandler(url: URL) {
  const db = getDatabase();
  const category = cleanText(url.searchParams.get("category"));
  const system = Object.values(BUILTIN_ASSETS).filter((a: any) => !category || a.category === category);
  const values: any[] = [];
  let where = `a.status='published' AND COALESCE(a.is_current,true)=true`;
  if (category) { values.push(category); where += ` AND COALESCE(c.name,a.proposed_category)=$1`; }
  const { rows } = await db.pool.query(`SELECT a.asset_id,a.dataset_id,a.title,a.asset_type,a.source_file_name AS source,a.description,a.fields,a.record_count,a.version_label,COALESCE(c.name,a.proposed_category) AS category,false AS system,a.searchable_text FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id WHERE ${where} ORDER BY a.published_at DESC NULLS LAST,a.created_at DESC`, values);
  return json({ ok: true, rows: [...system, ...rows.map((r: any) => ({ ...r, ai_ready: aiReady(r) }))] });
}

async function referenceAssetHandler(url: URL) {
  const id = cleanText(url.searchParams.get("id"));
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  if (!id) return json({ ok: false, error: "asset_id_required", message: "缺少资料 ID。" }, { status: 400 });
  const db = getDatabase();
  const out = await referenceAsset(db, id, page, limit);
  if (!out) return json({ ok: false, error: "asset_not_found", message: "没有找到这份已发布资料。" }, { status: 404 });
  return json({ ok: true, ...out });
}

async function sourceHandler(url: URL) {
  const id = cleanText(url.searchParams.get("id"));
  const db = getDatabase();
  const { rows } = await db.pool.query(`SELECT source_blob_key,source_file_name,mime_type,status FROM data_assets WHERE asset_id=$1 LIMIT 1`, [id]);
  const asset = rows[0];
  if (!asset || asset.status !== "published" || !asset.source_blob_key) return json({ ok: false, error: "source_not_found", message: "源文件不存在或尚未发布。" }, { status: 404 });
  const data = await sourceStore().get(asset.source_blob_key, { type: "arrayBuffer" });
  if (!data) return json({ ok: false, error: "source_blob_not_found", message: "源文件存储中未找到。" }, { status: 404 });
  return new Response(data, { headers: { "Content-Type": asset.mime_type || "application/octet-stream", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(safeFilename(asset.source_file_name))}` } });
}

async function uploadsHandler() {
  const db = getDatabase();
  const { rows } = await db.pool.query(`SELECT a.*,COALESCE(c.name,a.proposed_category) AS category,d.canonical_title AS dataset_title FROM data_assets a LEFT JOIN reference_categories c ON c.category_id=a.category_id LEFT JOIN reference_datasets d ON d.dataset_id=a.dataset_id ORDER BY a.created_at DESC LIMIT 100`);
  return json({ ok: true, rows: rows.map((a: any) => ({ ...a, ai_ready: aiReady(a) })) });
}

async function uploadHandler(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "file_required", message: "请选择要上传的文件。" }, { status: 400 });
  const name = file.name || "upload";
  const mime = file.type || "application/octet-stream";
  const allowed = /\.(xlsx?|csv|json|txt|md|pdf|docx?)$/i.test(name);
  if (!allowed) return json({ ok: false, error: "unsupported_file", message: "支持 xlsx/xls/csv/json/txt/md/pdf/doc/docx。" }, { status: 415 });
  const id = `AST-${crypto.randomUUID()}`;
  const blobKey = `assets/${id}/${safeFilename(name)}`;
  const bytes = await file.arrayBuffer();
  await sourceStore().set(blobKey, bytes);
  let assetType = "document";
  let fields: string[] = [];
  let rows: any[] = [];
  let searchableText = "";
  if (isStructuredFile(name, mime)) {
    assetType = "structured";
    const parsed = await parseStructured(file);
    fields = parsed.fields;
    rows = parsed.rows;
  } else if (/\.(txt|md)$/i.test(name)) searchableText = cleanText(await file.text()).slice(0, 300000);
  const classified = classifyAsset(name, fields, searchableText);
  const db = getDatabase();
  await db.pool.query(`INSERT INTO data_assets(asset_id,title,asset_type,source_file_name,source_blob_key,mime_type,file_size,status,proposed_category,classification_source,classification_confidence,description,fields,record_count,searchable_text,version_label,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,'classified',$8,$9,$10,$11,$12::jsonb,$13,$14,'v1','demo-admin')`, [id, name.replace(/\.[^.]+$/, ""), assetType, name, blobKey, mime, file.size, classified.category, classified.source, classified.confidence, `管理员上传：${name}`, JSON.stringify(fields), rows.length, searchableText || null]);
  if (rows.length) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < rows.length; i++) await client.query(`INSERT INTO data_asset_records(asset_id,row_no,data) VALUES($1,$2,$3::jsonb)`, [id, i + 1, JSON.stringify(rows[i])]);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }
  const asset = { asset_id: id, title: name.replace(/\.[^.]+$/, ""), source_file_name: name, mime_type: mime, file_size: file.size, asset_type: assetType, record_count: rows.length, fields, status: "classified", proposed_category: classified.category, category: classified.category, classification_source: classified.source, classification_confidence: classified.confidence, ai_ready: assetType === "structured" || !!searchableText };
  return json({ ok: true, asset });
}

async function publishHandler(req: Request) {
  const body: any = await req.json().catch(() => ({}));
  const assetId = cleanText(body.asset_id);
  const categoryName = cleanText(body.category_name) || "其他资料";
  const datasetTitle = cleanText(body.dataset_title);
  if (!assetId) return json({ ok: false, error: "asset_id_required", message: "缺少资料 ID。" }, { status: 400 });
  const db = getDatabase();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: assets } = await client.query(`SELECT * FROM data_assets WHERE asset_id=$1 FOR UPDATE`, [assetId]);
    const asset = assets[0];
    if (!asset) throw new Error("ASSET_NOT_FOUND");
    const { rows: cats } = await client.query(`INSERT INTO reference_categories(name,description) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET updated_at=NOW() RETURNING category_id`, [categoryName, CATEGORY_DESCRIPTIONS[categoryName] || "管理员发布的参考资料"]);
    const categoryId = cats[0].category_id;
    const canonicalTitle = datasetTitle || asset.title;
    const { rows: dsRows } = await client.query(`SELECT * FROM reference_datasets WHERE category_id=$1 AND canonical_title=$2 FOR UPDATE`, [categoryId, canonicalTitle]);
    let datasetId = dsRows[0]?.dataset_id;
    if (!datasetId) {
      datasetId = `DS-${crypto.randomUUID()}`;
      await client.query(`INSERT INTO reference_datasets(dataset_id,canonical_title,category_id) VALUES($1,$2,$3)`, [datasetId, canonicalTitle, categoryId]);
    }
    const { rows: vRows } = await client.query(`SELECT COALESCE(MAX(version_number),0)::int + 1 AS v FROM data_assets WHERE dataset_id=$1`, [datasetId]);
    const version = vRows[0]?.v || 1;
    await client.query(`UPDATE data_assets SET is_current=false WHERE dataset_id=$1`, [datasetId]);
    await client.query(`UPDATE data_assets SET category_id=$2,proposed_category=$3,dataset_id=$4,version_number=$5,version_label=$6,is_current=true,status='published',published_at=NOW(),updated_at=NOW() WHERE asset_id=$1`, [assetId, categoryId, categoryName, datasetId, version, `v${version}`]);
    await client.query(`UPDATE reference_datasets SET current_asset_id=$2,updated_at=NOW() WHERE dataset_id=$1`, [datasetId, assetId]);
    await client.query("COMMIT");
    return json({ ok: true, asset_id: assetId, dataset_id: datasetId, version_number: version, version_label: `v${version}`, category: categoryName });
  } catch (e: any) {
    await client.query("ROLLBACK");
    const message = e?.message === "ASSET_NOT_FOUND" ? "没有找到这份上传资料。" : "发布失败，请稍后重试。";
    return json({ ok: false, error: e?.message || "publish_failed", message }, { status: e?.message === "ASSET_NOT_FOUND" ? 404 : 500 });
  } finally { client.release(); }
}

async function lightweightList(table: string, orderBy: string) {
  const db = getDatabase();
  const allowed = new Set(["policies","events","expenses"]);
  if (!allowed.has(table)) return json({ ok: false, error: "not_allowed" }, { status: 400 });
  const { rows } = await db.pool.query(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT 200`);
  return json({ ok: true, rows });
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    if (path === "/api/status" && req.method === "GET") return statusHandler();
    if (path === "/api/query" && req.method === "POST") return queryHandler(req);
    if (path === "/api/audit" && req.method === "GET") return auditHandler();
    if (path === "/api/reference/categories" && req.method === "GET") return referenceCategoriesHandler();
    if (path === "/api/reference/assets" && req.method === "GET") return referenceAssetsHandler(url);
    if (path === "/api/reference/asset" && req.method === "GET") return referenceAssetHandler(url);
    if (path === "/api/reference/source" && req.method === "GET") return sourceHandler(url);
    if (path === "/api/governance/uploads" && req.method === "GET") return uploadsHandler();
    if (path === "/api/governance/upload" && req.method === "POST") return uploadHandler(req);
    if (path === "/api/governance/publish" && req.method === "POST") return publishHandler(req);
    if (path === "/api/catalog" && req.method === "GET") { const db=getDatabase(); const {rows}=await db.pool.query(`SELECT * FROM data_catalog ORDER BY domain_id`); return json({ok:true,rows}); }
    if (path === "/api/policies" && req.method === "GET") return lightweightList("policies", "published_date DESC");
    if (path === "/api/events" && req.method === "GET") return lightweightList("events", "start_time DESC");
    if (path === "/api/ledgers" && req.method === "GET") { const db=getDatabase(); const {rows}=await db.pool.query(`SELECT 'people' AS ledger,COUNT(*)::int AS records FROM people UNION ALL SELECT 'pension_payments',COUNT(*)::int FROM pension_payments UNION ALL SELECT 'welfare_records',COUNT(*)::int FROM welfare_records UNION ALL SELECT 'evacuations',COUNT(*)::int FROM evacuations UNION ALL SELECT 'expenses',COUNT(*)::int FROM expenses`); return json({ok:true,rows}); }
    return json({ ok: false, error: "not_found" }, { status: 404 });
  } catch (e: any) {
    console.error("api error", e);
    return json({ ok: false, error: "internal_error", message: e?.message || "服务暂时不可用。" }, { status: 500 });
  }
};

export const config: Config = {
  path: [
    "/api/status","/api/query","/api/audit","/api/catalog","/api/policies","/api/events","/api/ledgers",
    "/api/reference/categories","/api/reference/assets","/api/reference/asset","/api/reference/source",
    "/api/governance/uploads","/api/governance/upload","/api/governance/publish",
  ],
};
