const state={status:null,results:new Map(),history:[],favorites:JSON.parse(localStorage.getItem('hlk-favorites')||'[]'),reference:{categories:[],category:null,assets:[],asset:null,page:1},uploads:[],review:null,queryContext:null};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const safe=v=>(v??'—').toString();
const esc=v=>safe(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=v=>!v?'—':String(v).slice(0,10);
const fmtMoney=n=>Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const AI_AVATAR_SRC='./assets/ai-village-chief.png?v=0532';
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2200)}
async function api(url,opts={}){const r=await fetch(url,opts);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.message||d.error||`HTTP ${r.status}`);return d}

function renderQueryContext(){
  const box=$('#activeReferenceContext');
  if(!box)return;
  if(state.queryContext?.asset_id){
    $('#activeReferenceTitle').textContent=state.queryContext.title||state.queryContext.dataset_title||state.queryContext.asset_id;
    box.hidden=false;
    $('#contextDomain').textContent=`参考数据：${state.queryContext.title||state.queryContext.dataset_title||state.queryContext.asset_id}`;
    $('#contextDetail').textContent='连续追问将沿用这份资料';
  }else{
    box.hidden=true;
    $('#contextDomain').textContent='自动识别数据域';
    $('#contextDetail').textContent='仅查询已清洗并发布的数据';
  }
}
function setQueryContext(ctx){state.queryContext=ctx||null;renderQueryContext()}
function clearQueryContext(){state.queryContext=null;renderQueryContext();toast('已退出当前参考资料')}

function closeMenus(){['#moreMenu','#userMenu'].forEach(id=>$(id)?.classList.remove('show'));$('#moreMenuBtn')?.setAttribute('aria-expanded','false');$('#userMenuBtn')?.setAttribute('aria-expanded','false');$('#mobileNav')?.classList.remove('show');$('#mobileMenuBtn')?.setAttribute('aria-expanded','false')}
function showView(view){
  $$('.view').forEach(x=>x.classList.remove('active-view'));
  $$('[data-view]').forEach(x=>x.classList.remove('active'));
  const el=$(`#${view}View`);if(el)el.classList.add('active-view');
  $$(`[data-view="${view}"]`).forEach(x=>x.classList.add('active'));
  closeMenus();
  if(view==='history')loadHistory();
  if(view==='favorites')renderFavorites();
  if(view==='reference')loadReferenceHome();
  if(view==='governance')loadUploads();
  if(view==='audit')loadAudit();
  window.scrollTo({top:0,behavior:'instant'});
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#moreMenuBtn').onclick=e=>{e.stopPropagation();const menu=$('#moreMenu');const open=!menu.classList.contains('show');closeMenus();menu.classList.toggle('show',open);$('#moreMenuBtn').setAttribute('aria-expanded',String(open))};
$('#userMenuBtn').onclick=e=>{e.stopPropagation();const menu=$('#userMenu');const open=!menu.classList.contains('show');closeMenus();menu.classList.toggle('show',open);$('#userMenuBtn').setAttribute('aria-expanded',String(open))};
$('#mobileMenuBtn').onclick=e=>{e.stopPropagation();const menu=$('#mobileNav');const open=!menu.classList.contains('show');closeMenus();menu.classList.toggle('show',open);$('#mobileMenuBtn').setAttribute('aria-expanded',String(open))};
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap')&&!e.target.closest('.user-wrap')&&!e.target.closest('.mobile-menu-button'))closeMenus()});

function formatCell(v,k=''){if(v==null)return '—';if(typeof v==='object')return JSON.stringify(v);if(/日期|时间/.test(k))return fmtDate(v);if(/金额|费用|实缴|补贴/.test(k)&&!Number.isNaN(Number(v)))return `¥${fmtMoney(v)}`;return v}
function table(rows,cols){if(!rows?.length)return '<div class="empty-note">暂无记录</div>';cols=cols?.length?cols:Object.keys(rows[0]);return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td data-label="${esc(c)}" title="${esc(formatCell(r[c],c))}">${esc(formatCell(r[c],c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function addUser(q){$('#messages').insertAdjacentHTML('beforeend',`<div class="message user-message"><div class="message-bubble">${esc(q)}</div></div>`)}
function addAssistant(html,id=''){const attr=id?` data-loading-id="${id}"`:'';$('#messages').insertAdjacentHTML('beforeend',`<div class="message assistant-message"${attr}><div class="assistant-identity"><img class="assistant-avatar" src="${AI_AVATAR_SRC}" onerror="this.onerror=null;this.src='./assets/ai-village-chief.png'" alt="AI村长头像"><span>AI村长</span></div><div class="message-bubble assistant-bubble">${html}</div></div>`);scrollConversation()}
function scrollConversation(){requestAnimationFrame(()=>{const s=$('#conversationScroll');s.scrollTop=s.scrollHeight})}
function rid(){return `r${Date.now()}${Math.random().toString(36).slice(2,6)}`}
function renderResult(payload,id){
  const r=payload.result||{},facts=r.facts||[],primary=facts[0],rows=r.rows||[],total=r.recordRows?.length??rows.length,evidence=r.evidence||[];
  const secondary=facts.slice(primary?1:0).map(f=>`<div class="fact-card"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('');
  const verifyText=r.gap?'数据仍需补充':'数据库已核验';
  return `<article class="result-card">
    <div class="answer-summary">
      <div class="answer-kicker"><span class="dot"></span><span>${esc(r.domain||'综合查询')}</span><span>·</span><span>${verifyText}</span></div>
      <h3>${esc(r.title||'查询结果')}</h3>
      ${primary?`<div class="primary-kpi"><b>${esc(primary.value)}</b><span>${esc(primary.label)}</span></div>`:''}
      <p>${esc(r.summary||'')}</p>
    </div>
    <div class="result-main">
      ${secondary?`<div class="fact-grid">${secondary}</div>`:''}
      ${r.gap?`<div class="gap-advice"><strong>当前无法可靠回答：</strong>${esc((r.filters||[]).join('；'))}</div>`:''}
      ${rows.length?`<div class="detail-section"><div class="detail-head"><h4>${r.kind==='policy_search'?'匹配文件':'明细数据'}</h4><small>共 ${total} 条${rows.length<total?` · 当前展示 ${rows.length} 条`:''}</small></div>${table(rows,r.columns)}</div>`:''}
      ${payload.narrative&&payload.narrative!==r.summary?`<details class="narrative-details"><summary>查看结果说明</summary><p>${esc(payload.narrative)}</p></details>`:''}
      <div class="answer-footer">
        <div class="source-inline">${evidence.map(x=>`<span class="source-chip">${esc(x)}</span>`).join('')||'<span class="source-chip">数据库结果</span>'}</div>
        <div class="answer-actions">
          <button class="ghost-btn" data-action="basis" data-id="${id}">查看依据</button>
          <button class="ghost-btn" data-action="trace" data-id="${id}">执行过程</button>
          <button class="ghost-btn" data-action="favorite" data-id="${id}">☆ 收藏</button>
          ${!r.gap?`<details class="export-menu"><summary>导出结果 ▾</summary><div class="export-options"><button data-export="xlsx" data-id="${id}">Excel 明细表</button><button data-export="docx" data-id="${id}">Word 情况说明</button><button data-export="pptx" data-id="${id}">PPT 汇报材料</button></div></details>`:''}
        </div>
      </div>
    </div>
  </article>`
}
function bindResultActions(){
  $$('[data-action]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.onclick=()=>{
    const x=state.results.get(b.dataset.id);if(!x)return;
    if(b.dataset.action==='basis')openDrawer('数据依据','参考与口径',`<p><b>本次答案使用：</b></p><div class="source-inline">${(x.result.evidence||[]).map(e=>`<span class="source-chip">${esc(e)}</span>`).join('')}</div><p><b>查询口径：</b></p><ul>${(x.result.filters||[]).map(e=>`<li>${esc(e)}</li>`).join('')}</ul><p>需要人工核验时，可以从顶部「更多 → 参考数据」进入已发布资料。</p>`);
    if(b.dataset.action==='trace')openDrawer('执行过程','Agent Trace',`<p><b>模型模式：</b>${esc(x.model?.mode)} · ${esc(x.model?.name)}</p><p><b>Query Plan：</b></p><pre>${esc(JSON.stringify(x.plan,null,2))}</pre><p><b>受控 Skill：</b></p>${(x.result.tools||[]).map(t=>`<div class="list-row"><div><h4>${esc(t.name)}</h4><small>${esc(t.desc)}</small></div></div>`).join('')}`);
    if(b.dataset.action==='favorite'){const q=x.__query;if(!state.favorites.includes(q)){state.favorites.unshift(q);localStorage.setItem('hlk-favorites',JSON.stringify(state.favorites));toast('已收藏到常用问题')}}
  }});
  $$('[data-export]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.onclick=()=>exportResult(b.dataset.export,state.results.get(b.dataset.id))})
}

async function ask(q){
  q=(q||$('#queryInput').value).trim();if(!q)return;
  document.body.classList.add('conversation-mode');
  addUser(q);$('#queryInput').value='';resizeComposer();$('#sendBtn').disabled=true;$('#contextDomain').textContent='正在理解问题…';$('#contextDetail').textContent='查询已发布数据';
  const loadingId=rid();addAssistant('<div class="query-progress">正在查询已发布数据并核验依据…</div>',loadingId);
  try{
    const referenceContext=state.queryContext;
    const d=await api('/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,reference_context:referenceContext})});d.__query=q; d.__referenceContext=referenceContext;
    const id=rid();state.results.set(id,d);
    const loading=$(`[data-loading-id="${loadingId}"]`);if(loading)loading.remove();
    addAssistant(renderResult(d,id));bindResultActions();
    if(state.queryContext?.asset_id){
      renderQueryContext();
    }else{
      $('#contextDomain').textContent=(d.plan?.domains||[]).join(' + ')||'综合查询';
      $('#contextDetail').textContent=d.model?.mode==='netlify-ai-gateway'?`本次由 ${d.model.name} 规划`:'模型不可用，已使用规则兜底';
    }
  }catch(e){
    const loading=$(`[data-loading-id="${loadingId}"]`);if(loading)loading.remove();
    addAssistant(`<article class="result-card"><div class="answer-summary"><div class="answer-kicker"><span style="color:var(--color-error)">!</span><span>查询失败</span></div><h3>暂时没有查到结果</h3><p>${esc(e.message)}。请稍后重试；如果持续失败，请联系数据管理员检查数据源。</p></div></article>`);
    if(state.queryContext?.asset_id) renderQueryContext(); else {$('#contextDomain').textContent='查询失败';$('#contextDetail').textContent='请稍后重试';}
  }finally{$('#sendBtn').disabled=false;$('#queryInput').focus()}
}
$('#sendBtn').onclick=()=>ask();
$('#queryInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}});
function resizeComposer(){const e=$('#queryInput');e.style.height='auto';e.style.height=Math.min(e.scrollHeight,132)+'px'}
$('#queryInput').addEventListener('input',resizeComposer);
$('#clearReferenceContext').onclick=clearQueryContext;
renderQueryContext();

function openDrawer(title,eyebrow,html){$('#drawerTitle').textContent=title;$('#drawerEyebrow').textContent=eyebrow;$('#drawerBody').innerHTML=html;$('#detailDrawer').classList.add('open');$('#drawerBackdrop').classList.add('show');$('#detailDrawer').setAttribute('aria-hidden','false');$('#drawerClose').focus()}
function closeDrawer(){$('#detailDrawer').classList.remove('open');$('#drawerBackdrop').classList.remove('show');$('#detailDrawer').setAttribute('aria-hidden','true')}
$('#drawerClose').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});

async function loadStatus(){try{const d=await api('/api/status');state.status=d;const el=$('#dataStatus');el.textContent=`数据已载入 · ${d.counts.people} 人`;el.className='connection-badge ready'}catch{const el=$('#dataStatus');el.textContent='数据连接失败';el.className='connection-badge error'}}
async function loadHistory(){try{const d=await api('/api/audit');state.history=d.rows||[];$('#historyList').innerHTML=state.history.map(x=>`<div class="list-row"><div><h4>${esc(x.original_query)}</h4><p>${esc(x.result_summary||'')}</p><small>${fmtDate(x.created_at)}</small></div><div class="row-actions"><button class="ghost-btn" data-repeat="${esc(x.original_query)}">再次提问</button></div></div>`).join('')||'<div class="empty-note">暂无历史记录。</div>';$$('[data-repeat]').forEach(b=>b.onclick=()=>{showView('assistant');ask(b.dataset.repeat)})}catch(e){$('#historyList').innerHTML=`<div class="empty-note">${esc(e.message)}</div>`}}
function renderFavorites(){$('#favoriteList').innerHTML=state.favorites.map((q,i)=>`<div class="list-row"><div><h4>${esc(q)}</h4><small>收藏的 AI 查询</small></div><div class="row-actions"><button class="ghost-btn" data-fask="${i}">提问</button><button class="ghost-btn" data-fdel="${i}">移除</button></div></div>`).join('')||'<div class="empty-note">还没有收藏的常用问题。</div>';$$('[data-fask]').forEach(b=>b.onclick=()=>{showView('assistant');ask(state.favorites[+b.dataset.fask])});$$('[data-fdel]').forEach(b=>b.onclick=()=>{state.favorites.splice(+b.dataset.fdel,1);localStorage.setItem('hlk-favorites',JSON.stringify(state.favorites));renderFavorites()})}
async function loadAudit(){try{const d=await api('/api/audit');$('#auditList').innerHTML=(d.rows||[]).map(x=>`<div class="list-row"><div><h4>${esc(x.original_query)}</h4><p>${esc(x.result_summary)}</p><small>${fmtDate(x.created_at)} · ${esc(x.model_name||x.model_mode)}</small></div></div>`).join('')||'<div class="empty-note">暂无审计记录。</div>'}catch(e){$('#auditList').innerHTML=`<div class="empty-note">${esc(e.message)}</div>`}}

async function loadReferenceHome(){state.reference={categories:[],category:null,assets:[],asset:null,page:1};const root=$('#referenceContent');root.innerHTML='<div class="empty-note">正在加载参考数据…</div>';try{const d=await api('/api/reference/categories');state.reference.categories=d.rows||[];renderReferenceHome()}catch(e){root.innerHTML=`<div class="empty-note">${esc(e.message)}</div>`}}
function renderReferenceHome(){const root=$('#referenceContent');$('#referenceBreadcrumbs').innerHTML='<button data-ref-home>参考数据</button>';root.innerHTML=`<div class="reference-grid">${state.reference.categories.map(c=>`<button class="reference-category-card" data-category="${esc(c.name)}"><span class="category-icon">${icon(c.name)}</span><span><b>${esc(c.name)}</b><small>${esc(c.description||'已发布治理资料')}</small></span><em>${c.published_assets||0} 份</em></button>`).join('')}</div>`;$$('[data-category]').forEach(b=>b.onclick=()=>openCategory(b.dataset.category));$$('[data-ref-home]').forEach(b=>b.onclick=loadReferenceHome)}
function icon(n){if(n.includes('人口'))return '⌂';if(n.includes('养老'))return '◷';if(n.includes('民政'))return '♡';if(n.includes('应急'))return '△';if(n.includes('政策'))return '▤';return '◇'}
async function openCategory(name,page=1){state.reference.category=name;state.reference.page=page;const root=$('#referenceContent');root.innerHTML='<div class="empty-note">正在加载资料…</div>';try{const d=await api(`/api/reference/assets?category=${encodeURIComponent(name)}&page=${page}&page_size=8`);state.reference.assets=d.rows||[];$('#referenceBreadcrumbs').innerHTML=`<button data-ref-home>参考数据</button><span>›</span><b>${esc(name)}</b>`;root.innerHTML=`<div class="reference-grid asset-grid">${state.reference.assets.map(a=>`<button class="asset-card" data-asset="${esc(a.asset_id)}"><span class="asset-type">${a.asset_type==='document'?'文档':'数据表'}</span><b>${esc(a.title)}</b><small>${esc(a.source_file_name)}</small><span>${a.record_count||0} 条 · ${fmtDate(a.updated_at)}</span></button>`).join('')||'<div class="empty-note">暂无已发布资料。</div>'}</div><div class="pager" id="categoryPager"><span>第 ${d.page} / ${d.pages} 页</span>${d.page>1?'<button id="prevPage" class="ghost-btn">上一页</button>':''}${d.page<d.pages?'<button id="nextPage" class="ghost-btn">下一页</button>':''}</div>`;$$('[data-asset]').forEach(b=>b.onclick=()=>openReferenceAsset(b.dataset.asset));$$('[data-ref-home]').forEach(b=>b.onclick=loadReferenceHome);$('#prevPage')?.addEventListener('click',()=>openCategory(name,page-1));$('#nextPage')?.addEventListener('click',()=>openCategory(name,page+1))}catch(e){root.innerHTML=`<div class="empty-note">${esc(e.message)}</div>`}}
async function openReferenceAsset(id,page=1){state.reference.page=page;try{const d=await api(`/api/reference/asset?id=${encodeURIComponent(id)}&page=${page}&limit=20`);state.reference.asset=d;const a=d.asset;$('#referenceBreadcrumbs').innerHTML=`<button data-ref-home>参考数据</button><span>›</span><button data-category-back>${esc(a.category)}</button><span>›</span><b>${esc(a.title)}</b>`;$('#referenceContent').innerHTML=`<div class="asset-detail-card"><div class="asset-detail-head"><div><span class="status-dot published">已发布</span><h2>${esc(a.title)}</h2><p>${esc(a.source_file_name)} · ${a.record_count||0} 条记录 · 更新 ${fmtDate(a.updated_at)}</p></div><div class="row-actions"><button class="ghost-btn" id="askAssetBtn">基于此资料问 AI</button><button class="ghost-btn" id="sourceFileBtn">查看源文件</button></div></div><div class="source-info"><span>${esc(a.category)}</span><span>${esc(a.asset_id)}</span></div>${table(d.rows||[],d.columns)}<div class="pager"><span>第 ${d.page} / ${d.pages} 页</span>${d.page>1?'<button id="prevPage" class="ghost-btn">上一页</button>':''}${d.page<d.pages?'<button id="nextPage" class="ghost-btn">下一页</button>':''}</div></div>`;$('#askAssetBtn').onclick=()=>{setQueryContext({asset_id:a.asset_id,dataset_id:a.dataset_id,dataset_title:a.dataset_title||a.title,version_label:a.version_label,title:a.title,category:a.category,system:!!a.system,asset_type:a.asset_type});showView('assistant');$('#queryInput').value=`基于参考数据“${a.title}”，`;resizeComposer();$('#queryInput').focus()};$('#sourceFileBtn').onclick=()=>window.open(`/api/reference/source?id=${encodeURIComponent(id)}`,'_blank');$$('[data-ref-home]').forEach(b=>b.onclick=loadReferenceHome);$$('[data-category-back]').forEach(b=>b.onclick=()=>openCategory(a.category,1));$('#prevPage')?.addEventListener('click',()=>openReferenceAsset(id,page-1));$('#nextPage')?.addEventListener('click',()=>openReferenceAsset(id,page+1))}catch(e){$('#referenceContent').innerHTML=`<div class="empty-note">${esc(e.message)}</div>`}}

async function loadUploads(){try{const d=await api('/api/governance/uploads');state.uploads=d.rows||[];$('#uploadList').innerHTML=state.uploads.map(a=>`<div class="list-row"><div><h4>${esc(a.title)}</h4><p>${esc(a.source_file_name)} · ${a.record_count||0} 条${a.version_label?` · ${esc(a.version_label)}`:''}</p><small>${esc(a.status)} · 建议分类 ${esc(a.proposed_category||'未识别')}</small></div><div class="row-actions">${a.status==='uploaded'?`<button class="ghost-btn" data-review="${a.asset_id}">审核发布</button>`:`<button class="ghost-btn" data-openasset="${a.asset_id}">去参考数据</button>`}</div></div>`).join('')||'<div class="empty-note">暂无上传资料。</div>';$$('[data-review]').forEach(b=>b.onclick=()=>reviewAsset(b.dataset.review));$$('[data-openasset]').forEach(b=>b.onclick=()=>{showView('reference');openReferenceAsset(b.dataset.openasset)})}catch(e){$('#uploadList').innerHTML=`<div class="empty-note">${esc(e.message)}</div>`}}
function reviewAsset(id){const a=state.uploads.find(x=>x.asset_id===id);if(!a)return;state.review=a;showClassification(a)}
function showClassification(x){state.review=x;$('#classificationReview').innerHTML=`<div class="classification-card"><h3>发布前确认</h3><p>自动分类只是建议。确认后，文件才会正式进入参考数据，并成为 AI 可查询依据。</p><div class="classification-grid"><label>资料名称<input id="reviewTitle" value="${esc(x.title||x.source_file_name)}"></label><label>数据集名称<input id="reviewDatasetTitle" value="${esc(x.dataset_title||x.title||x.source_file_name)}"></label><label>确认分类<input id="reviewCategory" value="${esc(x.proposed_category||'其他')}"></label><label>当前状态<input value="${esc(x.status)}" disabled></label></div><p class="helper-text">如果是在更新同一份逻辑资料，请保持“数据集名称”和分类完全一致，系统会自动生成新版本；如果名称不同，则会创建新的数据集，避免误合并。</p><div class="review-actions"><button class="primary-btn" id="publishAssetBtn">确认发布</button><button class="ghost-btn" id="cancelReviewBtn">取消</button></div></div>`;$('#publishAssetBtn').onclick=publishReviewed;$('#cancelReviewBtn').onclick=()=>{$('#classificationReview').innerHTML='';state.review=null}}
async function publishReviewed(){if(!state.review)return;$('#publishAssetBtn').disabled=true;try{await api('/api/governance/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset_id:state.review.asset_id,category_name:$('#reviewCategory').value.trim(),title:$('#reviewTitle').value.trim(),dataset_title:$('#reviewDatasetTitle').value.trim()})});toast('发布成功，参考数据已更新');$('#classificationReview').innerHTML='';state.review=null;await loadUploads()}catch(e){toast(e.message)}finally{if($('#publishAssetBtn'))$('#publishAssetBtn').disabled=false}}
const fileInput=$('#governanceFile'),zone=$('#uploadZone');$('#chooseFileBtn').onclick=()=>fileInput.click();fileInput.onchange=()=>{if(fileInput.files[0])uploadGovernanceFile(fileInput.files[0])};['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('drag')}));['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag')}));zone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)uploadGovernanceFile(f)});
async function uploadGovernanceFile(file){zone.querySelector('h2').textContent='正在上传并自动分类…';const fd=new FormData();fd.append('file',file);try{const d=await api('/api/governance/upload',{method:'POST',body:fd});toast('上传完成，请确认分类');showClassification(d.asset);await loadUploads()}catch(e){toast(e.message)}finally{zone.querySelector('h2').textContent='上传已清洗数据';fileInput.value=''}}

function exportRows(x){return x?.result?.recordRows?.length?x.result.recordRows:x?.result?.rows||[]}
function exportResult(type,x){if(!x)return;const rows=exportRows(x),q=x.__query||'黄林坑村治理查询';if(type==='xlsx'){const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows.length?rows:[{查询:q,结果:x.result.summary}]);XLSX.utils.book_append_sheet(wb,ws,'查询结果');XLSX.writeFile(wb,'黄林坑村治理查询结果.xlsx')}else if(type==='docx'){const html=`<html><meta charset="utf-8"><body><h1>黄林坑村治理查询结果</h1><p><b>问题：</b>${esc(q)}</p><p>${esc(x.result.summary)}</p>${table(rows,x.result.columns)}</body></html>`;downloadBlob(new Blob([html],{type:'application/msword'}),'黄林坑村治理查询结果.doc')}else if(type==='pptx'&&window.PptxGenJS){const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';const slide=pptx.addSlide();slide.addText('黄林坑村治理查询结果',{x:.6,y:.5,w:11,h:.5,fontSize:24,bold:true});slide.addText(q,{x:.6,y:1.2,w:11,h:.5,fontSize:16});slide.addText(x.result.summary||'',{x:.6,y:2,w:11,h:1,fontSize:18});pptx.writeFile({fileName:'黄林坑村治理查询结果.pptx'})}}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}

loadStatus();
