function formatCell(v,k=''){if(v==null)return '—';if(typeof v==='object')return JSON.stringify(v);if(/日期|时间/.test(k))return fmtDate(v);if(/金额|费用|实缴|补贴/.test(k)&&!Number.isNaN(Number(v)))return `¥${fmtMoney(v)}`;return v}
function table(rows,cols){if(!rows?.length)return '<div class="empty-note">暂无记录</div>';cols=cols?.length?cols:Object.keys(rows[0]);return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td data-label="${esc(c)}" title="${esc(formatCell(r[c],c))}">${esc(formatCell(r[c],c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function addUser(q){$('#messages').insertAdjacentHTML('beforeend',`<div class="message user-message"><div class="message-bubble">${esc(q)}</div></div>`)}
function addAssistant(html,id=''){const attr=id?` data-loading-id="${id}"`:'';$('#messages').insertAdjacentHTML('beforeend',`<div class="message assistant-message"${attr}><div class="assistant-identity"><img class="assistant-avatar" src="./assets/ai-village-chief.png" alt="AI村长头像"><span>AI村长</span></div><div class="message-bubble assistant-bubble">${html}</div></div>`);scrollConversation()}
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
