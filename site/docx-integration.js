(() => {
  const isDocx = value => /\.docx$/i.test(String(value || ""));
  const needsDocxText = asset => isDocx(asset?.source_file_name) && asset?.ai_ready === false;

  const style = document.createElement("style");
  style.textContent = `
    .document-answer-card{border:1px solid var(--color-border);border-radius:var(--radius-panel);background:var(--color-surface);overflow:hidden}
    .document-answer-head{padding:24px 28px 20px;border-bottom:1px solid var(--color-border)}
    .document-answer-head h3{margin:10px 0 0;color:var(--color-government-navy);font-size:22px;line-height:1.35;font-weight:600}
    .document-answer-lead{margin:16px 0 0;color:var(--color-text);font-size:17px;line-height:1.8;white-space:pre-wrap}
    .document-answer-body{padding:8px 28px 24px}
    .document-answer-section{padding:18px 0;border-bottom:1px solid var(--color-border)}
    .document-answer-section:last-child{border-bottom:0}
    .document-answer-section h4{margin:0 0 10px;color:var(--color-government-navy);font-size:17px;font-weight:600}
    .document-answer-section ul{margin:0;padding-left:20px;color:var(--color-text-secondary)}
    .document-answer-section li{margin:7px 0;line-height:1.7;font-size:16px}
    .document-answer-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .document-meta-chip{display:inline-flex;align-items:center;min-height:28px;padding:3px 9px;border-radius:999px;background:var(--color-surface-soft);color:var(--color-text-muted);font-size:13px}
    .document-answer-card .answer-footer{border-top:1px solid var(--color-border)}
    .danger-btn{color:var(--color-error)!important;border-color:rgba(196,61,75,.28)!important}
    .danger-btn:hover{background:rgba(196,61,75,.07)!important;border-color:rgba(196,61,75,.48)!important}
    .upload-row .row-actions-admin{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    @media(max-width:767px){
      .document-answer-head{padding:20px 18px 16px}.document-answer-body{padding:6px 18px 18px}
      .document-answer-head h3{font-size:20px}.document-answer-lead{font-size:16px}
      .upload-row .row-actions-admin{justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);

  function inlineDocText(value) {
    return esc(String(value || ""))
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/\n/g, "<br>");
  }

  function documentResultHtml(payload, id) {
    const r = payload.result || {};
    const sections = Array.isArray(r.document_sections) ? r.document_sections : [];
    const evidence = r.evidence || [];
    const retrieval = r.document_meta?.retrieval || payload.plan?.steps?.[0]?.params?.retrieval || "已发布正文";
    const lead = inlineDocText(r.summary || "");
    const sectionHtml = sections.map(section => {
      const items = Array.isArray(section?.items) ? section.items.filter(Boolean) : [];
      if (!items.length) return "";
      return `<section class="document-answer-section"><h4>${esc(section.title || "要点")}</h4><ul>${items.map(item => `<li>${inlineDocText(item)}</li>`).join("")}</ul></section>`;
    }).join("");
    return `<article class="document-answer-card">
      <div class="document-answer-head">
        <div class="answer-kicker"><span class="dot"></span><span>${esc(r.domain || "参考数据")}</span><span>·</span><span>文档依据已核验</span></div>
        <h3>${esc(r.title || "文档问答")}</h3>
        <p class="document-answer-lead">${lead}</p>
        <div class="document-answer-meta"><span class="document-meta-chip">DOCX 正文</span><span class="document-meta-chip">检索：${esc(retrieval)}</span></div>
      </div>
      ${sectionHtml ? `<div class="document-answer-body">${sectionHtml}</div>` : ""}
      <div class="answer-footer">
        <div class="source-inline">${evidence.map(x => `<span class="source-chip">${esc(x)}</span>`).join("") || '<span class="source-chip">已发布 DOCX</span>'}</div>
        <div class="answer-actions">
          <button class="ghost-btn" data-action="basis" data-id="${id}">查看依据</button>
          <button class="ghost-btn" data-action="trace" data-id="${id}">执行过程</button>
          <button class="ghost-btn" data-action="favorite" data-id="${id}">☆ 收藏</button>
        </div>
      </div>
    </article>`;
  }

  const baseRenderResult = renderResult;
  renderResult = function renderResultWithDocumentLayout(payload, id) {
    if (payload?.result?.kind === "document_qa") return documentResultHtml(payload, id);
    return baseRenderResult(payload, id);
  };

  const baseSetQueryContext = setQueryContext;
  setQueryContext = function setQueryContextWithDocumentType(ctx) {
    if (ctx?.asset_id) {
      const active = state.reference?.asset?.asset;
      if (active?.asset_id === ctx.asset_id) {
        ctx = {
          ...ctx,
          asset_type: active.asset_type,
          source_file_name: active.source,
        };
      }
    }
    return baseSetQueryContext(ctx);
  };

  const baseApi = api;
  api = async function apiWithDocumentRouting(url, opts = {}) {
    if (url === "/api/query" && state.queryContext?.asset_type === "document") {
      let body = {};
      try { body = JSON.parse(opts.body || "{}"); } catch {}
      return baseApi("/api/reference/document/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, reference_context: state.queryContext }),
      });
    }
    return baseApi(url, opts);
  };

  async function parseDocxAsset(assetId, button) {
    if (!assetId) return null;
    if (button) {
      button.disabled = true;
      button.textContent = "正在解析…";
    }
    try {
      const result = await api("/api/governance/docx/reparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId }),
      });
      const note = result.asset?.parse_note || "DOCX 正文已解析，AI 现在可以读取。";
      toast(note);
      return result.asset || null;
    } catch (error) {
      toast(error?.message || "DOCX 正文解析失败");
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "解析正文";
      }
    }
  }

  async function deleteUploadedAsset(asset, button) {
    if (!asset?.asset_id) return;
    const statusNote = asset.status === "published"
      ? "删除后，这份资料会立即从参考数据和 AI 查询中移除；如果同一数据集存在上一版本，系统会自动回退到上一版本。"
      : "删除后，这份待发布资料及其源文件会被永久移除。";
    const ok = window.confirm(`确定删除“${asset.title || asset.source_file_name}”吗？\n\n${statusNote}\n\n此操作不可撤销。`);
    if (!ok) return;
    const oldText = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "删除中…"; }
    try {
      const result = await api("/api/governance/asset/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: asset.asset_id, confirm: true }),
      });
      if (state.queryContext?.asset_id === asset.asset_id) setQueryContext(null);
      if (state.review?.asset_id === asset.asset_id) {
        state.review = null;
        const panel = document.querySelector("#classificationReview");
        if (panel) panel.innerHTML = "";
      }
      toast(result.message || "资料已删除");
      await loadUploads();
    } catch (error) {
      toast(error?.message || "删除失败");
    } finally {
      if (button && document.body.contains(button)) { button.disabled = false; button.textContent = oldText || "删除"; }
    }
  }

  const baseRenderUploads = renderUploads;
  renderUploads = function renderUploadsWithDocumentActions() {
    baseRenderUploads();
    const rows = [...document.querySelectorAll("#uploadList .upload-row")];
    rows.forEach((row, index) => {
      const asset = state.uploads[index];
      if (!asset) return;
      const actionCell = row.lastElementChild;
      if (!actionCell) return;
      actionCell.classList.add("row-actions-admin");

      if (needsDocxText(asset) && !actionCell.querySelector("[data-docx-reparse]")) {
        const button = document.createElement("button");
        button.className = "ghost-btn";
        button.dataset.docxReparse = asset.asset_id;
        button.textContent = "解析正文";
        button.title = "从已保存的 DOCX 源文件提取全文，使 AI 可以查询这份资料";
        button.addEventListener("click", async () => {
          try {
            const parsed = await parseDocxAsset(asset.asset_id, button);
            if (parsed) {
              Object.assign(asset, parsed);
              if (state.review?.asset_id === asset.asset_id) {
                Object.assign(state.review, parsed);
                showClassification(state.review);
              }
              await loadUploads();
            }
          } catch {}
        });
        actionCell.prepend(button);
      }

      if (!actionCell.querySelector("[data-delete-asset]")) {
        const deleteButton = document.createElement("button");
        deleteButton.className = "ghost-btn danger-btn";
        deleteButton.dataset.deleteAsset = asset.asset_id;
        deleteButton.textContent = "删除";
        deleteButton.title = "永久删除这份管理员上传资料";
        deleteButton.addEventListener("click", () => deleteUploadedAsset(asset, deleteButton));
        actionCell.append(deleteButton);
      }
    });
  };

  const baseUploadGovernanceFile = uploadGovernanceFile;
  uploadGovernanceFile = async function uploadGovernanceFileWithDocxParser(file) {
    await baseUploadGovernanceFile(file);
    if (!isDocx(file?.name)) return;
    const asset = state.review;
    if (!asset?.asset_id || asset.ai_ready === true) return;
    const h2 = document.querySelector("#uploadZone h2");
    const previousTitle = h2?.textContent;
    if (h2) h2.textContent = "正在提取 DOCX 正文…";
    try {
      const parsed = await parseDocxAsset(asset.asset_id);
      if (parsed) {
        Object.assign(asset, parsed);
        showClassification(asset);
        await loadUploads();
      }
    } catch {
      showClassification(asset);
    } finally {
      if (h2) h2.textContent = previousTitle || "上传已清洗数据";
    }
  };
})();