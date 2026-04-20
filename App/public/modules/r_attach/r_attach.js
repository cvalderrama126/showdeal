async function init_r_attach() {
  const permissions = window.SD_PERMISSIONS?.r_attach || {
    read: true,
    create: true,
    update: true,
    delete: true,
  };
  const PAGE_SIZE = 10;
  const TABLE_COLUMNS = [
    "id_attach",
    "asset",
    "tp_attach",
    "file_name",
    "mime_type",
    "file_size",
    "is_active",
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showAlert(targetId, type, message) {
    const host = document.getElementById(targetId);
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function clearAlert(targetId) {
    const host = document.getElementById(targetId);
    if (host) host.innerHTML = "";
  }

  function renderNoAccess() {
    document.getElementById("appContent").innerHTML = `
      <div class="sd-card p-4">
        <h4 class="mb-1">Adjuntos</h4>
        <div class="alert alert-warning mb-0">
          <div class="fw-bold mb-1">Sin acceso</div>
          <div class="small">Tu usuario no tiene permisos de lectura para este modulo.</div>
        </div>
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

  function shortHash(value) {
    const text = String(value || "");
    if (text.length <= 12) return text;
    return `${text.slice(0, 8)}...`;
  }

  function api(path, options) {
    return window.SD_API.request(path, options);
  }

  const state = {
    rows: [],
    editingId: null,
    deletingId: null,
    currentRecord: null,
    options: {
      assets: [],
      attachmentTypes: [],
    },
    filters: {
      q: "",
      id_asset: "",
      tp_attach: "",
      includeInactive: true,
    },
    pagination: {
      take: PAGE_SIZE,
      skip: 0,
      total: 0,
    },
  };

  const attachModal = new bootstrap.Modal(document.getElementById("attachModal"));
  const deleteModal = new bootstrap.Modal(document.getElementById("attachDeleteModal"));
  const previewModal = new bootstrap.Modal(document.getElementById("attachPreviewModal"));

  function assetLabel(assetId) {
    const item = state.options.assets.find((row) => String(row.id_asset) === String(assetId));
    if (!item) return assetId || "";
    return `${item.uin} · ${item.tp_asset} · ${item.status}`;
  }

  function optionMarkup(items, selected, getValue, getLabel) {
    return items
      .map((item) => {
        const value = getValue(item);
        const label = getLabel(item);
        const isSelected = String(value) === String(selected ?? "");
        return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function buildForm(values = {}) {
    const form = document.getElementById("attachForm");
    const isEdit = state.editingId !== null && state.editingId !== undefined;
    form.reset();
    form.querySelector('[name="id_asset"]').innerHTML = `
      <option value="">Selecciona...</option>
      ${optionMarkup(
        state.options.assets,
        values.id_asset,
        (row) => row.id_asset,
        (row) => `${row.uin} · ${row.tp_asset} · ${row.status}`
      )}
    `;
    form.querySelector('[name="tp_attach"]').value = values.tp_attach || "";
    form.querySelector('[name="is_active"]').checked = values.is_active !== false;

    const fileInput = form.querySelector('[name="file"]');
    fileInput.required = !isEdit;

    const info = document.getElementById("attachCurrentFileInfo");
    if (isEdit && values.file_name) {
      info.innerHTML = `
        Archivo actual: <b>${escapeHtml(values.file_name)}</b><br>
        Tipo: <b>${escapeHtml(values.mime_type || "desconocido")}</b><br>
        Tamano: <b>${escapeHtml(formatBytes(values.file_size_bytes))}</b><br>
        Hash: <b title="${escapeHtml(values.file_hash || "")}">${escapeHtml(shortHash(values.file_hash))}</b>
      `;
    } else {
      info.textContent = "Selecciona un archivo para cargarlo en la base de datos.";
    }
  }

  function readFilters() {
    state.filters.q = document.getElementById("attachFilterSearch").value.trim();
    state.filters.id_asset = document.getElementById("attachFilterAsset").value;
    state.filters.tp_attach = document.getElementById("attachFilterType").value.trim();
    state.filters.includeInactive = document.getElementById("attachFilterInactive").checked;
  }

  function readForm() {
    const form = document.getElementById("attachForm");
    const data = new FormData();
    data.append("id_asset", form.querySelector('[name="id_asset"]').value);
    data.append("tp_attach", form.querySelector('[name="tp_attach"]').value.trim());
    data.append("is_active", form.querySelector('[name="is_active"]').checked ? "true" : "false");

    const file = form.querySelector('[name="file"]').files?.[0];
    if (file) data.append("file", file);
    return data;
  }

  function renderFilterOptions() {
    const assetSelect = document.getElementById("attachFilterAsset");
    assetSelect.innerHTML = `
      <option value="">Todos</option>
      ${optionMarkup(
        state.options.assets,
        state.filters.id_asset,
        (row) => row.id_asset,
        (row) => `${row.uin} · ${row.tp_asset}`
      )}
    `;

    const datalist = document.getElementById("attachTypeSuggestions");
    datalist.innerHTML = state.options.attachmentTypes
      .map((value) => `<option value="${escapeHtml(value)}"></option>`)
      .join("");
  }

  function tableValue(row, key) {
    switch (key) {
      case "asset":
        return row.asset_uin || assetLabel(row.id_asset);
      case "file_size":
        return formatBytes(row.file_size_bytes);
      case "is_active":
        return row.is_active === true ? "Si" : "No";
      default:
        return row?.[key] ?? "";
    }
  }

  function renderPagination() {
    const info = document.getElementById("attachPaginationInfo");
    const btnPrev = document.getElementById("btnAttachPrev");
    const btnNext = document.getElementById("btnAttachNext");
    const total = Number(state.pagination.total || 0);
    const from = total ? state.pagination.skip + 1 : 0;
    const to = Math.min(state.pagination.skip + state.rows.length, total);

    info.textContent = total
      ? `Mostrando ${from}-${to} de ${total} registros`
      : "Sin resultados";

    btnPrev.disabled = state.pagination.skip <= 0;
    btnNext.disabled = state.pagination.skip + state.pagination.take >= total;
  }

  function renderTable() {
    const head = document.getElementById("tblAttachHead");
    const body = document.getElementById("tblAttachBody");
    head.innerHTML = "";
    body.innerHTML = "";

    TABLE_COLUMNS.forEach((name) => {
      const th = document.createElement("th");
      th.textContent = name;
      head.appendChild(th);
    });

    const actionsHead = document.createElement("th");
    actionsHead.textContent = "Acciones";
    actionsHead.style.width = "220px";
    head.appendChild(actionsHead);

    state.rows.forEach((row) => {
      const tr = document.createElement("tr");
      TABLE_COLUMNS.forEach((key) => {
        const td = document.createElement("td");
        const value = tableValue(row, key);
        td.textContent = value;
        if (key === "file_name" && row.file_hash) {
          td.title = row.file_hash;
        }
        tr.appendChild(td);
      });

      const actions = [];
      if (canPreviewMime(row.mime_type)) {
        actions.push('<button class="btn btn-sm btn-sd-outline" data-act="preview">Preview</button>');
      }
      actions.push('<button class="btn btn-sm btn-sd-outline" data-act="download">Descargar</button>');
      if (permissions.update === true) {
        actions.push('<button class="btn btn-sm btn-sd-outline" data-act="edit">Editar</button>');
      }
      if (permissions.delete === true) {
        actions.push('<button class="btn btn-sm btn-sd" data-act="delete">Eliminar</button>');
      }

      const tdActions = document.createElement("td");
      tdActions.innerHTML = `<div class="d-flex flex-wrap gap-2">${actions.join("")}</div>`;

      tdActions.querySelector('[data-act="download"]')?.addEventListener("click", () => {
        downloadAttachment(row).catch((err) => {
          showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo descargar el archivo");
        });
      });
      tdActions.querySelector('[data-act="preview"]')?.addEventListener("click", () => {
        previewAttachment(row).catch((err) => {
          showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo previsualizar el archivo");
        });
      });
      tdActions.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
        openEdit(row).catch((err) => {
          showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo abrir el adjunto");
        });
      });
      tdActions.querySelector('[data-act="delete"]')?.addEventListener("click", () => openDelete(row));

      tr.appendChild(tdActions);
      body.appendChild(tr);
    });

    renderPagination();
  }

  async function loadOptions() {
    const response = await api("/api/r_attach/meta/options");
    state.options = response?.data || { assets: [], attachmentTypes: [] };
    renderFilterOptions();
  }

  async function loadRows({ resetPaging = false } = {}) {
    clearAlert("attachAlert");
    readFilters();
    if (resetPaging) state.pagination.skip = 0;

    const params = new URLSearchParams();
    params.set("take", String(state.pagination.take));
    params.set("skip", String(state.pagination.skip));
    if (state.filters.includeInactive) params.set("includeInactive", "true");
    if (state.filters.q) params.set("q", state.filters.q);
    if (state.filters.id_asset) params.set("id_asset", state.filters.id_asset);
    if (state.filters.tp_attach) params.set("tp_attach", state.filters.tp_attach);

    const response = await api(`/api/r_attach?${params.toString()}`);
    state.rows = Array.isArray(response?.data) ? response.data : [];
    state.pagination.total = Number(response?.meta?.total || state.rows.length || 0);
    renderTable();
  }

  function openCreate() {
    state.editingId = null;
    state.currentRecord = null;
    clearAlert("attachModalAlert");
    document.getElementById("attachModalTitle").textContent = "Nuevo adjunto";
    buildForm({ is_active: true });
    attachModal.show();
  }

  async function openEdit(row) {
    state.editingId = row?.id_attach;
    clearAlert("attachModalAlert");
    document.getElementById("attachModalTitle").textContent = "Editar adjunto";
    const response = await api(`/api/r_attach/${row.id_attach}?includeInactive=true`);
    state.currentRecord = response?.data || row || null;
    buildForm(state.currentRecord || {});
    attachModal.show();
  }

  async function saveAttachment() {
    clearAlert("attachModalAlert");

    try {
      const form = document.getElementById("attachForm");
      if (form && !form.reportValidity()) return;

      const payload = readForm();

      if (state.editingId === null || state.editingId === undefined) {
        if (!form.querySelector('[name="file"]').files?.[0]) {
          throw new Error("Debes seleccionar un archivo.");
        }
        await api("/api/r_attach", {
          method: "POST",
          body: payload,
        });
      } else {
        await api(`/api/r_attach/${state.editingId}`, {
          method: "PUT",
          body: payload,
        });
      }

      attachModal.hide();
      await loadRows();
      showAlert("attachAlert", "success", "Adjunto guardado correctamente.");
    } catch (err) {
      showAlert("attachModalAlert", "danger", err?.error || err?.message || "No se pudo guardar el adjunto");
    }
  }

  function openDelete(row) {
    state.deletingId = row?.id_attach;
    document.getElementById("attachDeleteInfo").innerHTML = `
      <div class="sd-muted small">ID: <b>${escapeHtml(row?.id_attach)}</b></div>
      <div class="sd-muted small">Archivo: <b>${escapeHtml(row?.file_name || "sin nombre")}</b></div>
      <div class="sd-muted small">Activo: <b>${escapeHtml(row?.asset_uin || row?.id_asset || "")}</b></div>
    `;
    deleteModal.show();
  }

  async function doDelete() {
    if (state.deletingId === null || state.deletingId === undefined) return;

    try {
      await api(`/api/r_attach/${state.deletingId}`, { method: "DELETE" });
      deleteModal.hide();
      await loadRows();
      showAlert("attachAlert", "success", "Adjunto desactivado correctamente.");
    } catch (err) {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo eliminar el adjunto");
    }
  }

  async function downloadAttachment(row) {
    const headers = window.SD_API.getAuthHeaders();
    const response = await fetch(row.download_url, {
      method: "GET",
      headers,
    });

    if (response.status === 401) {
      window.SD_API.clearSession();
      throw new Error("Sesion expirada.");
    }

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "No se pudo descargar el archivo.");
    }

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

  function canPreviewMime(mimeType) {
    const mime = String(mimeType || "").toLowerCase();
    return mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/");
  }

  async function previewAttachment(row) {
    const headers = window.SD_API.getAuthHeaders();
    const response = await fetch(row.download_url, {
      method: "GET",
      headers,
    });

    if (response.status === 401) {
      window.SD_API.clearSession();
      throw new Error("Sesion expirada.");
    }

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "No se pudo previsualizar el archivo.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const mime = String(row.mime_type || blob.type || "").toLowerCase();

    const title = document.getElementById("attachPreviewTitle");
    const body = document.getElementById("attachPreviewBody");
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

    previewModal.show();
    document.getElementById("attachPreviewModal")?.addEventListener(
      "hidden.bs.modal",
      () => URL.revokeObjectURL(url),
      { once: true }
    );
  }

  document.getElementById("btnRefreshAttach").addEventListener("click", () => {
    loadRows({ resetPaging: true }).catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo refrescar la tabla");
    });
  });
  document.getElementById("btnNewAttach").addEventListener("click", openCreate);
  document.getElementById("btnSaveAttach").addEventListener("click", saveAttachment);
  document.getElementById("btnConfirmAttachDelete").addEventListener("click", doDelete);
  document.getElementById("attachFilterSearch").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadRows({ resetPaging: true }).catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo aplicar el filtro");
    });
  });
  document.getElementById("attachFilterType").addEventListener("change", () => {
    loadRows({ resetPaging: true }).catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo aplicar el filtro");
    });
  });
  document.getElementById("attachFilterAsset").addEventListener("change", () => {
    loadRows({ resetPaging: true }).catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo aplicar el filtro");
    });
  });
  document.getElementById("attachFilterInactive").addEventListener("change", () => {
    loadRows({ resetPaging: true }).catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo aplicar el filtro");
    });
  });
  document.getElementById("btnAttachPrev").addEventListener("click", () => {
    if (state.pagination.skip <= 0) return;
    state.pagination.skip = Math.max(0, state.pagination.skip - state.pagination.take);
    loadRows().catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo cambiar la pagina");
    });
  });
  document.getElementById("btnAttachNext").addEventListener("click", () => {
    if (state.pagination.skip + state.pagination.take >= state.pagination.total) return;
    state.pagination.skip += state.pagination.take;
    loadRows().catch((err) => {
      showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo cambiar la pagina");
    });
  });

  if (permissions.read !== true) {
    renderNoAccess();
    return;
  }

  if (permissions.create !== true) {
    document.getElementById("btnNewAttach").hidden = true;
  }

  try {
    await loadOptions();
    await loadRows({ resetPaging: true });
  } catch (err) {
    showAlert("attachAlert", "danger", err?.error || err?.message || "No se pudo inicializar el modulo de adjuntos");
  }
}
