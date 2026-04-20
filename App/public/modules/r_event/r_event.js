async function init_r_event() {
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const auctionPermissions = window.SD_PERMISSIONS?.r_auction || {
    read: true,
    create: true,
    update: true,
    delete: true,
  };

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

  const eventAssetState = {
    event: null,
    rows: [],
    assets: [],
    modal: null,
  };

  const attachState = {
    asset: null,
    rows: [],
    modal: null,
    previewUrl: null,
  };

  const inviteState = {
    event: null,
    rows: [],     // r_invitation rows
    companies: [], // all companies
    modal: null,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureEventAssetsUi() {
    if (document.getElementById("eventAssetsModal")) return;

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="modal fade" id="eventAssetsModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content sd-card">
            <div class="modal-header">
              <h5 class="modal-title" id="eventAssetsTitle">Activos del evento</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div id="eventAssetsAlert"></div>

              <div class="row g-3 mb-3">
                <div class="col-md-9">
                  <label class="form-label">Activo</label>
                  <select class="form-select" id="eventAssetId"></select>
                </div>
                <div class="col-md-3 d-grid">
                  <label class="form-label">&nbsp;</label>
                  <button class="btn btn-sd" id="btnEventAssetAdd">Agregar</button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-sm align-middle sd-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Activo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="eventAssetsRows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);
  }

  function ensureAttachModalUi() {
    if (document.getElementById("eventAttachModal")) return;

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="modal fade" id="eventAttachModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content sd-card">
            <div class="modal-header">
              <h5 class="modal-title" id="eventAttachTitle">Adjuntos del activo</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div id="eventAttachAlert"></div>
              <div class="table-responsive">
                <table class="table table-sm align-middle sd-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Tipo</th>
                      <th>Archivo</th>
                      <th>Tamaño</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="eventAttachRows"></tbody>
                </table>
              </div>
              <div id="eventAttachPreviewBox" class="d-none mt-3">
                <h6 id="eventAttachPreviewTitle">Previsualizacion</h6>
                <div id="eventAttachPreviewBody" style="border:1px solid #ddd;border-radius:12px;padding:12px;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);
  }

  function ensureInviteModalUi() {
    if (document.getElementById("eventInviteModal")) return;

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="modal fade" id="eventInviteModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content sd-card">
            <div class="modal-header">
              <h5 class="modal-title" id="eventInviteTitle">Compañías invitadas</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div id="eventInviteAlert"></div>

              <div class="row g-3 mb-3">
                <div class="col-md-9">
                  <label class="form-label">Compañía</label>
                  <select class="form-select" id="eventInviteCompanyId"></select>
                </div>
                <div class="col-md-3 d-grid">
                  <label class="form-label">&nbsp;</label>
                  <button class="btn btn-sd" id="btnEventInviteAdd">Agregar</button>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-sm align-middle sd-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Compañía</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="eventInviteRows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);
  }

  function showEventAssetAlert(type, message) {
    const host = document.getElementById("eventAssetsAlert");
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function showAttachAlert(type, message) {
    const host = document.getElementById("eventAttachAlert");
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
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

  function attachmentTypeLabel(type) {
    const code = String(type || "").trim().toUpperCase();
    return ATTACH_TYPE_LABELS[code] || type || "";
  }

  function renderAttachRows() {
    const body = document.getElementById("eventAttachRows");
    if (!body) return;
    body.innerHTML = "";

    attachState.rows.forEach((row) => {
      const tr = document.createElement("tr");
      const downloadBtn = `<button class="btn btn-sm btn-sd-outline" data-act="download" data-id="${escapeHtml(row.id_attach)}">Descargar</button>`;
      const previewBtn = `<button class="btn btn-sm btn-sd-outline" data-act="preview" data-id="${escapeHtml(row.id_attach)}">Previsualizar</button>`;
      
      tr.innerHTML = `
        <td>${escapeHtml(row.id_attach)}</td>
        <td>${escapeHtml(attachmentTypeLabel(row.tp_attach))}</td>
        <td>${escapeHtml(row.file_name || "")}</td>
        <td>${escapeHtml(formatBytes(row.file_size))}</td>
        <td><div class="d-flex flex-wrap gap-2">${downloadBtn}${previewBtn}</div></td>
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

    const title = document.getElementById("eventAttachPreviewTitle");
    const body = document.getElementById("eventAttachPreviewBody");
    const box = document.getElementById("eventAttachPreviewBox");
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

  async function openEmbeddedAttachments(asset) {
    if (attachPermissions.read !== true) {
      throw new Error("Tu perfil no tiene permisos para ver adjuntos");
    }

    ensureAttachModalUi();
    if (!attachState.modal) {
      attachState.modal = new bootstrap.Modal(document.getElementById("eventAttachModal"));
    }

    attachState.asset = asset;
    const title = document.getElementById("eventAttachTitle");
    if (title) {
      title.textContent = `Adjuntos de ${asset.uin || `Activo #${asset.id_asset}`}`;
    }

    const previewBox = document.getElementById("eventAttachPreviewBox");
    const previewBody = document.getElementById("eventAttachPreviewBody");
    if (previewBody) previewBody.innerHTML = "";
    previewBox?.classList.add("d-none");

    await loadEmbeddedAttachments();
    attachState.modal.show();
  }

  function renderAssetOptions() {
    const select = document.getElementById("eventAssetId");
    if (!select) return;
    const options = eventAssetState.assets
      .map((row) => `<option value="${escapeHtml(row.id_asset)}">${escapeHtml(row.uin || row.id_asset)} · ${escapeHtml(row.tp_asset || "")}</option>`)
      .join("");
    select.innerHTML = `<option value="">Selecciona...</option>${options}`;
  }

  function renderEventAssetRows() {
    const body = document.getElementById("eventAssetsRows");
    if (!body) return;
    const assetById = new Map(eventAssetState.assets.map((a) => [String(a.id_asset), a]));
    body.innerHTML = "";

    eventAssetState.rows.forEach((row) => {
      const tr = document.createElement("tr");
      const asset = assetById.get(String(row.id_asset));
      const assetLabel = asset
        ? `${asset.uin || row.id_asset} · ${asset.tp_asset || ""} · ${asset.status || ""}`
        : String(row.id_asset || "");
      
      const attachBtn = `<button class="btn btn-sm btn-sd-outline" data-act="attachments" data-id="${escapeHtml(row.id_asset)}">Adjuntos</button>`;
      const deleteBtn = auctionPermissions.delete === true
        ? `<button class="btn btn-sm btn-sd" data-act="delete" data-id="${escapeHtml(row.id_auction)}">Eliminar</button>`
        : "";

      tr.innerHTML = `
        <td>${escapeHtml(row.id_auction)}</td>
        <td>${escapeHtml(assetLabel)}</td>
        <td><div class="d-flex flex-wrap gap-2">${attachBtn}${deleteBtn}</div></td>
      `;

      body.appendChild(tr);
    });
  }

  async function loadEventAssetOptions() {
    const response = await window.SD_API.request("/api/r_asset?take=500");
    eventAssetState.assets = Array.isArray(response?.data) ? response.data : [];
    renderAssetOptions();
  }

  async function loadEventAssets() {
    if (!eventAssetState.event?.id_event) return;
    const query = `/api/r_auction?id_event=${encodeURIComponent(eventAssetState.event.id_event)}&take=500`;
    const response = await window.SD_API.request(query);
    eventAssetState.rows = Array.isArray(response?.data) ? response.data : [];
    renderEventAssetRows();
  }

  async function addAssetToEvent() {
    if (auctionPermissions.create !== true) {
      throw new Error("Tu perfil no tiene permisos para crear relaciones evento-activo");
    }
    if (!eventAssetState.event?.id_event) {
      throw new Error("No hay evento seleccionado");
    }

    const idAsset = String(document.getElementById("eventAssetId")?.value || "").trim();
    let tpAuction = String(eventAssetState.event.tp_event || "SEALED_BID").toUpperCase();
    
    // Validate tp_auction is one of the allowed values
    const validTypes = ["SEALED_BID", "LIVE_AUCTION"];
    if (!validTypes.includes(tpAuction)) {
      tpAuction = "SEALED_BID"; // Default fallback
    }

    if (!idAsset) throw new Error("Debes seleccionar un activo");

    await window.SD_API.request("/api/r_auction", {
      method: "POST",
      body: {
        id_event: String(eventAssetState.event.id_event),
        id_asset: String(idAsset),
        tp_auction: tpAuction,
        is_active: true,
      },
    });

    await loadEventAssets();
    showEventAssetAlert("success", "Activo vinculado al evento correctamente");
  }

  async function deleteEventAsset(row) {
    if (auctionPermissions.delete !== true) {
      throw new Error("Tu perfil no tiene permisos para eliminar relaciones evento-activo");
    }
    await window.SD_API.request(`/api/r_auction/${row.id_auction}`, { method: "DELETE" });
    await loadEventAssets();
  }

  function showInviteAlert(type, message) {
    const host = document.getElementById("eventInviteAlert");
    if (!host) return;
    host.innerHTML = `<div class="alert alert-${type} py-2 mb-3"><div class="small">${escapeHtml(message)}</div></div>`;
  }

  function renderInviteCompanyOptions() {
    const select = document.getElementById("eventInviteCompanyId");
    if (!select) return;
    const invitedIds = new Set(inviteState.rows.map((r) => String(r.id_company)));
    const options = inviteState.companies
      .filter((c) => !invitedIds.has(String(c.id_company)))
      .map((c) => `<option value="${escapeHtml(c.id_company)}">${escapeHtml(c.company || c.id_company)}</option>`)
      .join("");
    select.innerHTML = `<option value="">Selecciona...</option>${options}`;
  }

  function renderInviteRows() {
    const body = document.getElementById("eventInviteRows");
    if (!body) return;
    const companyById = new Map(inviteState.companies.map((c) => [String(c.id_company), c]));
    body.innerHTML = "";
    inviteState.rows.forEach((row) => {
      const company = companyById.get(String(row.id_company));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.id_invitation)}</td>
        <td>${escapeHtml(company?.company || row.id_company)}</td>
        <td><button class="btn btn-sm btn-sd" data-invite-act="delete" data-id="${escapeHtml(row.id_invitation)}">Eliminar</button></td>
      `;
      body.appendChild(tr);
    });
  }

  async function loadInviteData() {
    if (!inviteState.event?.id_event) return;
    const [invRes, compRes] = await Promise.all([
      window.SD_API.request(`/api/r_invitation?id_event=${encodeURIComponent(inviteState.event.id_event)}&includeInactive=false&take=200`),
      window.SD_API.request("/api/r_company?take=500"),
    ]);
    inviteState.rows = Array.isArray(invRes?.data) ? invRes.data : [];
    inviteState.companies = Array.isArray(compRes?.data) ? compRes.data : [];
    renderInviteRows();
    renderInviteCompanyOptions();
  }

  async function addInvitation() {
    if (!inviteState.event?.id_event) throw new Error("No hay evento seleccionado");
    const idCompany = String(document.getElementById("eventInviteCompanyId")?.value || "").trim();
    if (!idCompany) throw new Error("Debes seleccionar una compañía");

    await window.SD_API.request("/api/r_invitation", {
      method: "POST",
      body: {
        id_event: String(inviteState.event.id_event),
        id_company: idCompany,
        is_active: true,
      },
    });

    await loadInviteData();
    showInviteAlert("success", "Compañía agregada al evento correctamente");
  }

  async function removeInvitation(id) {
    await window.SD_API.request(`/api/r_invitation/${id}`, { method: "DELETE" });
    await loadInviteData();
    showInviteAlert("success", "Compañía eliminada del evento");
  }

  async function openEventInvites(row) {
    ensureInviteModalUi();
    if (!inviteState.modal) {
      inviteState.modal = new bootstrap.Modal(document.getElementById("eventInviteModal"));
    }

    inviteState.event = row;
    const title = document.getElementById("eventInviteTitle");
    if (title) title.textContent = `Compañías invitadas al evento #${row.id_event}`;

    await loadInviteData();
    inviteState.modal.show();
  }

  async function openEventAssets(row) {
    if (auctionPermissions.read !== true) {
      throw new Error("Tu perfil no tiene permisos para ver relaciones evento-activo");
    }

    ensureEventAssetsUi();
    if (!eventAssetState.modal) {
      eventAssetState.modal = new bootstrap.Modal(document.getElementById("eventAssetsModal"));
    }

    // Validate and fix tp_event if needed
    const validTypes = ["SEALED_BID", "LIVE_AUCTION"];
    const tpEvent = String(row.tp_event || "").toUpperCase();
    if (!validTypes.includes(tpEvent)) {
      // If invalid, update it to default
      row.tp_event = "SEALED_BID";
      try {
        await window.SD_API.request(`/api/r_event/${row.id_event}`, {
          method: "PUT",
          body: { tp_event: "SEALED_BID" },
        });
      } catch (err) {
        console.warn("No se pudo actualizar el tp_event del evento:", err);
      }
    }

    eventAssetState.event = row;
    const title = document.getElementById("eventAssetsTitle");
    if (title) {
      title.textContent = `Activos del evento #${row.id_event} (${row.tp_event || ""})`;
    }

    await loadEventAssetOptions();
    await loadEventAssets();
    eventAssetState.modal.show();
  }

  document.addEventListener("click", async (e) => {
    const target = e.target.closest("#eventAssetsRows [data-act]");
    if (!target) return;
    e.preventDefault();

    const action = target.getAttribute("data-act");
    const id = target.getAttribute("data-id");
    
    if (action === "attachments") {
      const asset = eventAssetState.assets.find((item) => String(item.id_asset) === String(id));
      if (asset) {
        try {
          await openEmbeddedAttachments(asset);
        } catch (err) {
          showEventAssetAlert("danger", err?.error || err?.message || "No se pudo abrir los adjuntos");
        }
      }
      return;
    }

    const row = eventAssetState.rows.find((item) => String(item.id_auction) === String(id));
    if (!row) return;

    try {
      if (action === "delete") await deleteEventAsset(row);
    } catch (err) {
      showEventAssetAlert("danger", err?.error || err?.message || "No se pudo ejecutar la accion");
    }
  });

  document.addEventListener("click", async (e) => {
    const target = e.target.closest("#eventAttachRows [data-act]");
    if (!target) return;
    e.preventDefault();

    const action = target.getAttribute("data-act");
    const id = target.getAttribute("data-id");
    const row = attachState.rows.find((item) => String(item.id_attach) === String(id));
    if (!row) return;

    try {
      if (action === "download") await downloadEmbeddedAttachment(row);
      if (action === "preview") await previewEmbeddedAttachment(row);
    } catch (err) {
      showAttachAlert("danger", err?.error || err?.message || "No se pudo ejecutar la accion");
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.id !== "btnEventAssetAdd") return;
    e.preventDefault();
    addAssetToEvent().catch((err) => {
      const status = Number(err?.status || 0);
      if (status === 409) {
        showEventAssetAlert("warning", "Ese activo ya está vinculado a este evento");
        return;
      }
      showEventAssetAlert("danger", err?.error || err?.message || "No se pudo agregar el activo al evento");
    });
  });

  document.addEventListener("click", (e) => {
    if (e.target.id === "btnEventInviteAdd") {
      e.preventDefault();
      addInvitation().catch((err) => {
        const status = Number(err?.status || 0);
        if (status === 409) {
          showInviteAlert("warning", "Esa compañía ya está invitada a este evento");
          return;
        }
        showInviteAlert("danger", err?.error || err?.message || "No se pudo agregar la compañía");
      });
      return;
    }

    const target = e.target.closest("[data-invite-act='delete']");
    if (!target) return;
    e.preventDefault();
    const id = target.getAttribute("data-id");
    removeInvitation(id).catch((err) => {
      showInviteAlert("danger", err?.error || err?.message || "No se pudo eliminar la compañía");
    });
  });

  await window.SD_CRUD.mount({
    title: "Eventos",
    description: "Administración de eventos y ventanas de subasta.",
    endpoint: "/api/r_event",
    listEndpoint: "/api/r_event?includeInactive=true&take=200",
    idField: "id_event",
    pageSize: 10,
    searchPlaceholder: "Buscar por tipo de evento",
    formHelp: "Las fechas se guardan con hora.",
    filters: [
      {
        name: "tp_event",
        label: "Tipo",
        type: "select",
        options: [
          { value: "SEALED_BID", label: "Sobre cerrado" },
          { value: "LIVE_AUCTION", label: "En vivo" },
        ],
      },
    ],
    columns: [
      { key: "id_event", label: "ID" },
      { key: "tp_event", label: "Tipo" },
      { key: "start_at", label: "Inicio" },
      { key: "end_at", label: "Fin" },
      { key: "is_active", label: "Activo" },
    ],
    rowActions: [
      {
        action: "assets",
        label: "Activos",
        className: "btn btn-sm btn-sd-outline",
        visible: () => auctionPermissions.read === true,
      },
      {
        action: "companies",
        label: "Compañías",
        className: "btn btn-sm btn-sd-outline",
        visible: () => window.SD_USER?.isAdmin === true,
      },
    ],
    onRowAction: async ({ action, row }) => {
      if (action === "assets") await openEventAssets(row);
      if (action === "companies") await openEventInvites(row);
    },
    defaults: {
      tp_event: "SEALED_BID",
      start_at: localNow,
      end_at: localNow,
      is_active: true,
    },
    fields: [
      {
        name: "tp_event",
        label: "Tipo de subasta",
        type: "select",
        required: true,
        options: [
          { value: "SEALED_BID", label: "Sobre cerrado" },
          { value: "LIVE_AUCTION", label: "En vivo" },
        ],
        help: "Tipo de subasta para todos los activos del evento",
      },
      { name: "start_at", label: "Inicio", type: "datetime-local", required: true },
      { name: "end_at", label: "Fin", type: "datetime-local", required: true },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
