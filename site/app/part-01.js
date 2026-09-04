const state={status:null,results:new Map(),history:[],favorites:JSON.parse(localStorage.getItem('hlk-favorites')||'[]'),reference:{categories:[],category:null,assets:[],asset:null,page:1},uploads:[],review:null,queryContext:null};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const safe=v=>(v??'—').toString();
const esc=v=>safe(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=v=>!v?'—':String(v).slice(0,10);
const fmtMoney=n=>Number(n||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
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
