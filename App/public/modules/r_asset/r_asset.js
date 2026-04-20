async function init_r_asset() {
  const attachPermissions = window.SD_PERMISSIONS?.r_attach || {
    read: true,
    create: true,
    update: true,
    delete: true,
  };

  const ATTACH_TYPE_LABELS = {
    PHOTO: "Foto",
    APPRAISAL: "Avaluo",
    LEGAL_DOCUMENT: "Documento legal",
    TITLE_DEED: "Escritura",
    INVOICE: "Factura",
    TECHNICAL_REPORT: "Informe tecnico",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const digits = unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
  }

  function canPreviewMime(mime) {
    const m = String(mime || "").toLowerCase();
    return m.startsWith("image/") || m === "application/pdf" || m.startsWith("text/");
  }

  function attachmentTypeLabel(type) {
    const code = String(type || "").trim().toUpperCase();
    return ATTACH_TYPE_LABELS[code] || type || "";
  }

  function ensureEmbeddedAttachmentUi() {
    if (document.getElementById("assetAttachModal")) return;

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="modal fade" id="assetAttachModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content sd-card">
            <div class="modal-header">
              <h5 class="modal-title" id="assetAttachTitle">Adjuntos del activo</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div id="assetAttachAlert"></div>
              <div class="row g-3 mb-3">
                <div class="col-md-4">
                  <label class="form-label">Tipo de adjunto</label>
                  <select class="form-select" id="assetAttachType">
                    <option value="">-- Seleccionar --</option>
                    <option value="PHOTO">Foto</option>
                    <option value="APPRAISAL">Avalúo</option>
                    <option value="LEGAL_DOCUMENT">Documento legal</option>
                    <option value="TITLE_DEED">Escritura</option>
                    <option value="INVOICE">Factura</option>
                    <option value="TECHNICAL_REPORT">Informe técnico</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Archivo</label>
                  <input class="form-control" type="file" id="assetAttachFile" accept=".pdf,.jpg,.jpeg,.png,.gif,.txt,.csv,.xlsx,.xls,.doc,.docx">
                </div>
                <div class="col-md-2 d-grid">
                  <label class="form-label">&nbsp;</label>
                  <button class="btn btn-sd" id="btnAssetAttachUpload">Subir</button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-sm align-middle sd-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Tipo</th>
                      <th>Archivo</th>
                      <th>MIME</th>
                      <th>Tamano</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="assetAttachRows"></tbody>
                </table>
              </div>

              <div id="assetAttachPreviewBox" class="mt-3 d-none">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <h6 class="mb-0" id="assetAttachPreviewTitle">Previsualizacion</h6>
                  <button type="button" class="btn btn-sm btn-sd-outline" id="btnAssetAttachPreviewClose">Cerrar preview</button>
                </div>
                <div id="assetAttachPreviewBody"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);
  }

  const attachState = {
    asset: null,
    rows: [],
    modal: null,
    previewUrl: null,
  };

  function showAttachAlert(type, message) {
    const host = document.getElementById("assetAttachAlert");
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function renderAttachRows() {
    const body = document.getElementById("assetAttachRows");
    if (!body) return;
    body.innerHTML = "";

    attachState.rows.forEach((row) => {
      const tr = document.createElement("tr");
      const previewBtn = canPreviewMime(row.mime_type)
        ? `<button class="btn btn-sm btn-sd-outline" data-act="preview" data-id="${escapeHtml(row.id_attach)}">Preview</button>`
        : "";
      const deleteBtn = attachPermissions.delete === true
        ? `<button class="btn btn-sm btn-sd" data-act="delete" data-id="${escapeHtml(row.id_attach)}">Eliminar</button>`
        : "";

      tr.innerHTML = `
        <td>${escapeHtml(row.id_attach)}</td>
        <td>${escapeHtml(attachmentTypeLabel(row.tp_attach))}</td>
        <td>${escapeHtml(row.file_name || "")}</td>
        <td>${escapeHtml(row.mime_type || "")}</td>
        <td>${escapeHtml(formatBytes(row.file_size_bytes))}</td>
        <td>
          <div class="d-flex flex-wrap gap-2">
            ${previewBtn}
            <button class="btn btn-sm btn-sd-outline" data-act="download" data-id="${escapeHtml(row.id_attach)}">Descargar</button>
            ${deleteBtn}
          </div>
        </td>
      `;

      body.appendChild(tr);
    });
  }

  async function loadEmbeddedAttachments() {
    if (!attachState.asset?.id_asset) return;
    const response = await window.SD_API.request(
      `/api/r_attach?id_asset=${encodeURIComponent(attachState.asset.id_asset)}&includeInactive=true&take=200`
    );
    attachState.rows = Array.isArray(response?.data) ? response.data : [];
    renderAttachRows();
  }

  async function downloadEmbeddedAttachment(row) {
    const headers = window.SD_API.getAuthHeaders();
    const response = await fetch(row.download_url, { method: "GET", headers });
    if (!response.ok) throw new Error("No se pudo descargar el adjunto");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = row.file_name || `attachment-${row.id_attach}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function previewEmbeddedAttachment(row) {
    const headers = window.SD_API.getAuthHeaders();
    const response = await fetch(row.download_url, { method: "GET", headers });
    if (!response.ok) throw new Error("No se pudo cargar la previsualizacion");

    if (attachState.previewUrl) {
      URL.revokeObjectURL(attachState.previewUrl);
      attachState.previewUrl = null;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    attachState.previewUrl = url;
    const mime = String(row.mime_type || blob.type || "").toLowerCase();

    const title = document.getElementById("assetAttachPreviewTitle");
    const body = document.getElementById("assetAttachPreviewBody");
    const box = document.getElementById("assetAttachPreviewBox");
    if (!body || !box) throw new Error("No se pudo inicializar la previsualizacion");
    if (title) title.textContent = `Previsualizacion - ${row.file_name || row.id_attach}`;

    if (mime.startsWith("image/")) {
      body.innerHTML = `<img src="${url}" alt="preview" style="max-width:100%;height:auto;border-radius:12px;">`;
    } else if (mime === "application/pdf") {
      body.innerHTML = `<iframe src="${url}" style="width:100%;height:75vh;border:0;border-radius:12px;"></iframe>`;
    } else if (mime.startsWith("text/")) {
      const text = await blob.text();
      body.innerHTML = `<pre style="white-space:pre-wrap;max-height:75vh;overflow:auto;">${escapeHtml(text)}</pre>`;
    } else {
      body.innerHTML = `<div class="alert alert-info mb-0">No hay previsualizacion para este tipo de archivo. Usa Descargar.</div>`;
    }

    box.classList.remove("d-none");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteEmbeddedAttachment(row) {
    await window.SD_API.request(`/api/r_attach/${row.id_attach}`, { method: "DELETE" });
    await loadEmbeddedAttachments();
  }

  async function uploadEmbeddedAttachment() {
    if (attachPermissions.create !== true) {
      throw new Error("Tu perfil no tiene permisos para crear adjuntos");
    }

    const typeInput = document.getElementById("assetAttachType");
    const fileInput = document.getElementById("assetAttachFile");

    const tp_attach = String(typeInput?.value || "").trim();
    const file = fileInput?.files?.[0];

    if (!tp_attach) throw new Error("Debes indicar el tipo de adjunto");
    if (!file) throw new Error("Debes seleccionar un archivo");

    const payload = new FormData();
    payload.append("id_asset", String(attachState.asset.id_asset));
    payload.append("tp_attach", tp_attach);
    payload.append("is_active", "true");
    payload.append("file", file);

    await window.SD_API.request("/api/r_attach", { method: "POST", body: payload });

    typeInput.value = "";
    fileInput.value = "";
    await loadEmbeddedAttachments();
    showAttachAlert("success", "Adjunto cargado correctamente");
  }

  async function openEmbeddedAttachments(row) {
    if (attachPermissions.read !== true) {
      throw new Error("Tu perfil no tiene permisos para ver adjuntos");
    }

    ensureEmbeddedAttachmentUi();
    if (!attachState.modal) {
      attachState.modal = new bootstrap.Modal(document.getElementById("assetAttachModal"));
    }

    attachState.asset = row;
    const title = document.getElementById("assetAttachTitle");
    if (title) {
      title.textContent = `Adjuntos de ${row.uin || `Activo #${row.id_asset}`}`;
    }

    const previewBox = document.getElementById("assetAttachPreviewBox");
    const previewBody = document.getElementById("assetAttachPreviewBody");
    if (previewBody) previewBody.innerHTML = "";
    previewBox?.classList.add("d-none");

    await loadEmbeddedAttachments();
    attachState.modal.show();
  }

  document.addEventListener("click", async (e) => {
    const target = e.target.closest("#assetAttachRows [data-act]");
    if (!target) return;
    e.preventDefault();

    const action = target.getAttribute("data-act");
    const id = target.getAttribute("data-id");
    const row = attachState.rows.find((item) => String(item.id_attach) === String(id));
    if (!row) return;

    try {
      if (action === "download") await downloadEmbeddedAttachment(row);
      if (action === "preview") await previewEmbeddedAttachment(row);
      if (action === "delete") await deleteEmbeddedAttachment(row);
    } catch (err) {
      showAttachAlert("danger", err?.error || err?.message || "No se pudo ejecutar la accion");
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.id !== "btnAssetAttachUpload") return;
    e.preventDefault();
    uploadEmbeddedAttachment().catch((err) => {
      showAttachAlert("danger", err?.error || err?.message || "No se pudo subir el adjunto");
    });
  });

  document.addEventListener("click", (e) => {
    if (e.target.id !== "btnAssetAttachPreviewClose") return;
    const previewBox = document.getElementById("assetAttachPreviewBox");
    const previewBody = document.getElementById("assetAttachPreviewBody");
    if (attachState.previewUrl) {
      URL.revokeObjectURL(attachState.previewUrl);
      attachState.previewUrl = null;
    }
    if (previewBody) previewBody.innerHTML = "";
    previewBox?.classList.add("d-none");
  });


  await window.SD_CRUD.mount({
    title: "Activos",
    description: "Catálogo de activos disponibles en ShowDeal.",
    endpoint: "/api/r_asset",
    listEndpoint: "/api/r_asset?includeInactive=true&take=200",
    idField: "id_asset",
    pageSize: 10,
    searchPlaceholder: "Buscar por UIN, ciudad, direccion o tipo",
    formHelp: "Los valores monetarios usan decimales. El campo additional es opcional y debe ser JSON válido.",
    filters: [
      {
        name: "status",
        label: "Estado",
        type: "select",
        options: ["REGISTERED", "APPRAISED", "PUBLISHED", "IN_AUCTION", "SOLD", "UNSOLD", "CANCELLED"],
      },
      {
        name: "tp_asset",
        label: "Tipo",
        type: "text",
        placeholder: "Ej. HOUSE",
      },
    ],
    columns: [
      { key: "id_asset", label: "ID" },
      { key: "uin", label: "UIN" },
      { key: "tp_asset", label: "Tipo" },
      { key: "status", label: "Estado" },
      { key: "location_city", label: "Ciudad" },
      { key: "reserve_price", label: "Reserva" },
      { key: "is_active", label: "Activo" },
    ],
    rowActions: [
      {
        action: "attachments",
        label: "Adjuntos",
        className: "btn btn-sm btn-sd-outline",
        visible: () => attachPermissions.read === true,
      },
    ],
    onRowAction: async ({ action, row }) => {
      if (action !== "attachments") return;
      await openEmbeddedAttachments(row);
    },
    defaults: {
      is_active: true,
      book_value: "0",
      appraised_value: "0",
      expected_value: "0",
      reserve_price: "0",
      starting_bid: "0",
      realized_value: "0",
      version_number: "1",
    },
    fields: [
      { name: "uin", label: "UIN", type: "text", required: true },
      { name: "tp_asset", label: "Tipo de activo", type: "text", required: true },
      {
        name: "status",
        label: "Estado",
        type: "select",
        required: true,
        options: ["REGISTERED", "APPRAISED", "PUBLISHED", "IN_AUCTION", "SOLD", "UNSOLD", "CANCELLED"],
      },
      { name: "book_value", label: "Valor contable", type: "number", step: "0.01", required: true },
      { name: "appraised_value", label: "Avalúo", type: "number", step: "0.01", required: true },
      { name: "expected_value", label: "Valor esperado", type: "number", step: "0.01", required: true },
      { name: "reserve_price", label: "Precio reserva", type: "number", step: "0.01", required: true },
      { name: "starting_bid", label: "Oferta inicial", type: "number", step: "0.01", required: true },
      { name: "realized_value", label: "Valor realizado", type: "number", step: "0.01", required: true },
      { name: "location_city", label: "Ciudad", type: "text", required: true },
      { name: "location_address", label: "Dirección", type: "text", required: true },
      { name: "version_number", label: "Versión", type: "number", required: true },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });

  // === BULK UPLOAD UI =====================================================
  // Inject a toolbar with "Plantilla" + "Carga masiva (Excel)" actions on top
  // of the asset CRUD module. Posts to POST /api/r_asset/bulk-upload and shows
  // a per-row report (success / error) in a Bootstrap modal.
  ensureBulkUploadUi();
}

function ensureBulkUploadUi() {
  const root = document.getElementById("crudModuleRoot");
  if (!root || document.getElementById("assetBulkToolbar")) return;

  const bar = document.createElement("div");
  bar.id = "assetBulkToolbar";
  bar.className = "d-flex justify-content-end gap-2 mb-2";
  bar.innerHTML = `
    <a id="assetBulkTemplate" class="btn btn-sd-outline btn-sm" href="#" role="button">
      <i class="bi bi-download"></i> Plantilla Excel
    </a>
    <button id="assetBulkBtn" type="button" class="btn btn-sd btn-sm">
      <i class="bi bi-upload"></i> Carga masiva (Excel)
    </button>
    <input id="assetBulkFile" type="file" accept=".xlsx,.xls" class="d-none">
  `;
  root.insertBefore(bar, root.firstChild);

  const modalHost = document.createElement("div");
  modalHost.innerHTML = `
    <div class="modal fade" id="assetBulkModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content sd-card">
          <div class="modal-header">
            <h5 class="modal-title">Resultado de carga masiva</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="assetBulkBody">
            <div class="text-muted">Procesando...</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sd-outline" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modalHost);

  document.getElementById("assetBulkBtn").addEventListener("click", () => {
    document.getElementById("assetBulkFile").click();
  });

  document.getElementById("assetBulkTemplate").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const session = JSON.parse(localStorage.getItem("showdeal_session") || "null");
      const token = session?.token || "";
      const resp = await fetch("/api/r_asset/bulk-template", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "r_asset_bulk_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("No se pudo descargar la plantilla: " + (err?.message || err));
    }
  });

  document.getElementById("assetBulkFile").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    const modalEl = document.getElementById("assetBulkModal");
    const body = document.getElementById("assetBulkBody");
    body.innerHTML = '<div class="text-muted">Subiendo y procesando archivo...</div>';
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    try {
      const formData = new FormData();
      formData.append("file", file);
      let result;
      try {
        result = await window.SD_API.request("/api/r_asset/bulk-upload", {
          method: "POST",
          body: formData,
        });
      } catch (apiErr) {
        // Partial-success responses (207 Multi-Status) are thrown by SD_API
        // because ok=false. We still want to render the per-row report.
        if (apiErr && apiErr.summary && Array.isArray(apiErr.results)) {
          result = apiErr;
        } else {
          throw apiErr;
        }
      }

      const summary = result?.summary || {};
      const rows = Array.isArray(result?.results) ? result.results : [];
      const failed = rows.filter((r) => !r.ok);
      const succeeded = rows.filter((r) => r.ok);

      const failedRowsHtml = failed.length
        ? `<h6 class="mt-3 text-danger">Filas con error (${failed.length})</h6>
           <ul class="small">${failed
             .map((r) => `<li>Fila ${r.row}: <code>${r.error || "ROW_FAILED"}</code></li>`)
             .join("")}</ul>`
        : "";

      body.innerHTML = `
        <div class="alert ${failed.length ? "alert-warning" : "alert-success"}">
          Total: ${summary.totalRows || 0} ·
          Éxitos: ${summary.success || succeeded.length} ·
          Errores: ${summary.failed || failed.length}
        </div>
        ${failedRowsHtml}
      `;

      // Refresh table when at least one row was created.
      if ((summary.success || succeeded.length) > 0 && window.SD_CRUD?.reload) {
        try { await window.SD_CRUD.reload(); } catch (_) { /* ignore */ }
      }
    } catch (err) {
      body.innerHTML = `<div class="alert alert-danger">
        Error al cargar: ${(err && err.message) || err}
      </div>`;
    } finally {
      input.value = "";
    }
  });
}
