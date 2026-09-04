(() => {
  const isDocx = value => /\.docx$/i.test(String(value || ""));
  const needsDocxText = asset => isDocx(asset?.source_file_name) && asset?.ai_ready === false;

  // Preserve document metadata in the conversation context so follow-up questions
  // can use the dedicated full-text document query path instead of the generic table planner.
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

  // Route published document conversations to a document-specific full-text QA endpoint.
  // Structured tables continue to use the original /api/query route unchanged.
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

  // Add a reparsing action for historical DOCX files that were uploaded before V0.5.0.
  const baseRenderUploads = renderUploads;
  renderUploads = function renderUploadsWithDocxParser() {
    baseRenderUploads();
    const rows = [...document.querySelectorAll("#uploadList .upload-row")];
    rows.forEach((row, index) => {
      const asset = state.uploads[index];
      if (!needsDocxText(asset)) return;
      const actionCell = row.lastElementChild;
      if (!actionCell || actionCell.querySelector("[data-docx-reparse]")) return;
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
    });
  };

  // New DOCX uploads are parsed automatically after the source file is safely stored.
  // Publishing is still a separate, explicit administrator action.
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
      // The source file remains archived even when text extraction fails.
      showClassification(asset);
    } finally {
      if (h2) h2.textContent = previousTitle || "上传已清洗数据";
    }
  };
})();
