(() => {
  const style = document.createElement("style");
  style.textContent = `
    .intent-answer{padding:4px 2px 2px;max-width:760px}
    .intent-answer-meta{display:flex;align-items:center;gap:8px;margin-bottom:9px;color:var(--color-text-muted);font-size:13px}
    .intent-answer-meta .intent-dot{width:7px;height:7px;border-radius:50%;background:var(--color-primary);display:inline-block}
    .intent-answer p{margin:0;color:var(--color-text);font-size:17px;line-height:1.85;white-space:pre-wrap}
    .intent-help{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);padding:18px 20px;max-width:760px}
    .intent-help h3{margin:0 0 8px;color:var(--color-government-navy);font-size:17px}
    .intent-help p{margin:0;color:var(--color-text-secondary);font-size:16px;line-height:1.8;white-space:pre-wrap}
    .intent-clarify{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface-soft);padding:18px 20px;max-width:760px}
    .intent-clarify h3{margin:0 0 8px;color:var(--color-government-navy);font-size:17px}
    .intent-clarify p{margin:0;color:var(--color-text-secondary);font-size:16px;line-height:1.8;white-space:pre-wrap}
    @media(max-width:767px){.intent-answer p{font-size:16px}.intent-help,.intent-clarify{padding:16px}}
  `;
  document.head.appendChild(style);

  function bindAvatar(img){
    if(!(img instanceof HTMLImageElement) || !img.classList.contains("assistant-avatar")) return;
    img.onerror = null;
    if(!img.dataset.avatarGuard){
      img.dataset.avatarGuard = "1";
      img.addEventListener("error", () => {
        img.onerror = null;
        img.src = "/assets/ai-village-chief-fallback.png?v=0533";
      }, { once:true });
    }
    const wanted = new URL("/assets/ai-village-chief.png?v=0533", location.origin).href;
    if(img.src !== wanted) img.src = wanted;
  }
  document.querySelectorAll("img.assistant-avatar").forEach(bindAvatar);
  new MutationObserver(records => {
    for(const r of records){
      for(const n of r.addedNodes){
        if(!(n instanceof Element)) continue;
        if(n.matches?.("img.assistant-avatar")) bindAvatar(n);
        n.querySelectorAll?.("img.assistant-avatar").forEach(bindAvatar);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});

  const baseRenderResult = renderResult;
  renderResult = function renderResultWithIntentMode(payload, id) {
    const r = payload?.result || {};
    const kind = r.kind;
    if (kind === "chat") {
      return `<div class="intent-answer"><div class="intent-answer-meta"><span class="intent-dot"></span><span>闲聊 · 未查询数据库</span></div><p>${esc(r.summary || "")}</p></div>`;
    }
    if (kind === "system_help") {
      return `<div class="intent-help"><h3>${esc(r.title || "系统使用说明")}</h3><p>${esc(r.summary || "")}</p></div>`;
    }
    if (kind === "clarify") {
      return `<div class="intent-clarify"><h3>${esc(r.title || "我还不确定你想做什么")}</h3><p>${esc(r.summary || "")}</p></div>`;
    }
    return baseRenderResult(payload, id);
  };
})();
