async function init_r_buyer_won() {
  const host = document.getElementById("buyerWonRoot");
  if (!host) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatFileSize(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setAlert(type, message) {
    const alertHost = document.getElementById("buyerWonAlert");
    if (!alertHost) return;
    alertHost.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function renderDocuments(docs) {
    if (!Array.isArray(docs) || docs.length === 0) {
      return '<span class="badge text-bg-secondary">Pendiente</span>';
    }

    return docs
      .map((doc) => {
        const label = String(doc.tp_attach || "Documento").replaceAll("_", " ");
        const fileName = doc.file_name ? escapeHtml(doc.file_name) : "Sin nombre";
        const fileSize = formatFileSize(doc.file_size_bytes);
        const canDownload = doc.has_file === true && typeof doc.download_url === "string" && doc.download_url.length > 0;
        const action = canDownload
          ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(doc.download_url)}" target="_blank" rel="noopener">Descargar</a>`
          : '<span class="badge text-bg-warning">Archivo pendiente</span>';

        return `
          <div class="border rounded p-2 mb-2">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <div class="fw-semibold small">${escapeHtml(label)}</div>
                <div class="small text-muted">${fileName} · ${escapeHtml(fileSize)}</div>
              </div>
              ${action}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderRows(rows) {
    const rowsHost = document.getElementById("buyerWonRows");
    if (!rowsHost) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      rowsHost.innerHTML = `
        <tr>
          <td colspan="11" class="text-center text-muted py-4">
            Aún no tienes vehículos ganados o pendientes de publicación de información.
          </td>
        </tr>
      `;
      return;
    }

    rowsHost.innerHTML = rows
      .map((row) => {
        const appraisalDocs = Array.isArray(row.appraisal_documents) ? row.appraisal_documents : [];
        const docs = Array.isArray(row.documents) ? row.documents : [];

        const appraisalBlock = row.appraisal_available
          ? `
              <div class="small"><strong>Valor:</strong> $ ${escapeHtml(money(row.appraised_value))}</div>
              <div class="small mt-2">${renderDocuments(appraisalDocs)}</div>
            `
          : '<span class="badge text-bg-secondary">Pendiente de avalúo</span>';

        const documentsBlock = row.documents_available
          ? renderDocuments(docs)
          : '<span class="badge text-bg-secondary">Pendiente de documentación</span>';

        return `
          <tr>
            <td>${escapeHtml(row.id_asset)}</td>
            <td>
              <div class="fw-semibold">${escapeHtml(row.plate || "-")}</div>
              <div class="small text-muted">${escapeHtml(row.brand || "-")} ${escapeHtml(row.model || "-")} ${escapeHtml(row.year || "")}</div>
            </td>
            <td>${escapeHtml(row.city || "-")}</td>
            <td>${escapeHtml(row.tp_asset || "-")}</td>
            <td>${row.id_event ? `#${escapeHtml(row.id_event)}` : "-"}</td>
            <td>${row.id_auction ? `#${escapeHtml(row.id_auction)}` : "-"}</td>
            <td>$ ${escapeHtml(money(row.won_value))}</td>
            <td>${escapeHtml(formatDate(row.resolved_at))}</td>
            <td><span class="badge text-bg-info">${escapeHtml(row.asset_status || "-")}</span></td>
            <td>${appraisalBlock}</td>
            <td>${documentsBlock}</td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadWonVehicles() {
    setAlert("info", "Cargando vehículos ganados...");
    const response = await window.SD_API.request("/api/r_buyer_won");
    const rows = Array.isArray(response?.data) ? response.data : [];
    renderRows(rows);
    setAlert("success", `Se encontraron ${rows.length} vehículo(s) ganado(s).`);
  }

  host.innerHTML = `
    <div class="sd-card p-3 p-lg-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h4 class="mb-1">Vehículos ganados</h4>
          <div class="sd-muted">Consulta los vehículos adjudicados y revisa avalúos/documentación en cuanto estén disponibles.</div>
        </div>
        <button class="btn btn-sd-outline btn-sm" id="btnBuyerWonRefresh">Actualizar</button>
      </div>

      <div id="buyerWonAlert"></div>

      <div class="table-responsive">
        <table class="table table-sm align-middle sd-table">
          <thead>
            <tr>
              <th>ID Activo</th>
              <th>Vehículo</th>
              <th>Ciudad</th>
              <th>Tipo</th>
              <th>Evento</th>
              <th>Subasta</th>
              <th>Valor ganador</th>
              <th>Resuelto en</th>
              <th>Estado</th>
              <th>Avalúo</th>
              <th>Documentos</th>
            </tr>
          </thead>
          <tbody id="buyerWonRows"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("btnBuyerWonRefresh")?.addEventListener("click", () => {
    loadWonVehicles().catch((err) => {
      setAlert("danger", err?.message || err?.error || "No se pudo actualizar la lista de vehículos ganados.");
    });
  });

  try {
    await loadWonVehicles();
  } catch (err) {
    setAlert("warning", err?.message || err?.error || "No fue posible cargar la información de vehículos ganados.");
    renderRows([]);
  }
}
