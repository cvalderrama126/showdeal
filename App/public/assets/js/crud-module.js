(function (global) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function prettyJson(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function dateTimeLocalValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function parseFieldValue(field, input) {
    if (field.type === "checkbox") {
      return input.checked === true;
    }

    const raw = input.value ?? "";
    const trimmed = typeof raw === "string" ? raw.trim() : raw;

    if (field.type === "json") {
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        throw new Error(`El campo ${field.label} debe contener JSON valido.`);
      }
    }

    if (!trimmed && field.emptyAsNull) return null;
    return trimmed;
  }

  function displayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Si" : "No";
    if (typeof value === "object") return prettyJson(value);
    return String(value);
  }

  function fieldInputValue(field, record) {
    const value = record?.[field.name];
    if (field.type === "checkbox") return value === true;
    if (field.type === "json") return prettyJson(value);
    if (field.type === "datetime-local") return dateTimeLocalValue(value);
    if (field.type === "date") return value ? String(value).slice(0, 10) : "";
    return value ?? field.defaultValue ?? "";
  }

  async function loadOptions(definition) {
    if (Array.isArray(definition.options)) {
      return definition.options.map((item) => {
        if (item && typeof item === "object") return item;
        return { value: item, label: item };
      });
    }

    if (!definition.optionsEndpoint) return [];

    const response = await global.SD_API.request(definition.optionsEndpoint);
    const rows = Array.isArray(response?.data) ? response.data : [];

    return rows.map((row) => ({
      value: definition.optionValue ? definition.optionValue(row) : row[definition.optionValueKey || definition.name],
      label: definition.optionLabel ? definition.optionLabel(row) : row[definition.optionLabelKey || definition.name],
    }));
  }

  function renderField(field, record, optionsMap) {
    const currentValue = fieldInputValue(field, record);
    const required = field.required ? "required" : "";

    if (field.type === "checkbox") {
      return `
        <div class="col-12 col-md-6">
          <div class="form-check mt-4">
            <input class="form-check-input" type="checkbox" id="crud_${field.name}" name="${field.name}" ${currentValue ? "checked" : ""}>
            <label class="form-check-label" for="crud_${field.name}">${escapeHtml(field.label)}</label>
          </div>
        </div>
      `;
    }

    if (field.type === "json" || field.type === "textarea") {
      return `
        <div class="col-12">
          <label class="form-label">${escapeHtml(field.label)}</label>
          <textarea class="form-control" rows="${field.rows || 5}" name="${field.name}" ${required}>${escapeHtml(currentValue)}</textarea>
        </div>
      `;
    }

    if (field.type === "select") {
      const options = optionsMap.get(field.name) || [];
      const optionHtml = options
        .map((item) => {
          const selected = String(item.value) === String(currentValue);
          return `<option value="${escapeHtml(item.value)}" ${selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`;
        })
        .join("");

      return `
        <div class="col-12 col-md-6">
          <label class="form-label">${escapeHtml(field.label)}</label>
          <select class="form-select" name="${field.name}" ${required}>
            <option value="">Selecciona...</option>
            ${optionHtml}
          </select>
        </div>
      `;
    }

    return `
      <div class="col-12 col-md-6">
        <label class="form-label">${escapeHtml(field.label)}</label>
        <input class="form-control" type="${field.type || "text"}" name="${field.name}" value="${escapeHtml(currentValue)}" ${required} ${field.step ? `step="${field.step}"` : ""} ${field.minLength ? `minlength="${field.minLength}"` : ""}>
      </div>
    `;
  }

  function renderFilterControl(filter, state, optionsMap) {
    const value = state.filterValues[filter.name] ?? "";

    if (filter.type === "select") {
      const options = optionsMap.get(filter.name) || [];
      const optionHtml = options
        .map((item) => {
          const selected = String(item.value) === String(value);
          return `<option value="${escapeHtml(item.value)}" ${selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`;
        })
        .join("");

      return `
        <div class="col-12 col-md-6 col-xl-3">
          <label class="form-label">${escapeHtml(filter.label)}</label>
          <select class="form-select" data-filter-name="${filter.name}">
            <option value="">Todos</option>
            ${optionHtml}
          </select>
        </div>
      `;
    }

    return `
      <div class="col-12 col-md-6 col-xl-3">
        <label class="form-label">${escapeHtml(filter.label)}</label>
        <input
          class="form-control"
          type="${filter.type || "text"}"
          data-filter-name="${filter.name}"
          value="${escapeHtml(value)}"
          placeholder="${escapeHtml(filter.placeholder || "")}"
        >
      </div>
    `;
  }

  function parseListEndpoint(rawEndpoint) {
    const endpoint = String(rawEndpoint || "");
    const [path, queryString = ""] = endpoint.split("?");
    return {
      path: path || endpoint,
      params: new URLSearchParams(queryString),
    };
  }

  function buildPaginationMeta(state, response) {
    const total = Number(response?.meta?.total || state.rows.length || 0);
    return {
      total,
      hasMore: response?.meta?.hasMore === true || state.pagination.skip + state.rows.length < total,
    };
  }

  async function mount(config) {
    const root = document.getElementById(config.rootId || "crudModuleRoot");
    if (!root) throw new Error("No existe el contenedor del modulo.");

    const permissionModule = config.permissionModule || String(config.endpoint || "").split("/").pop();
    const permissions = global.SD_PERMISSIONS?.[permissionModule] || {
      read: true,
      create: true,
      update: true,
      delete: true,
    };
    const filters = Array.isArray(config.filters) ? config.filters : [];
    const listConfig = parseListEndpoint(config.listEndpoint || `${config.endpoint}?includeInactive=true`);
    const initialTake = Number.parseInt(listConfig.params.get("take") || "", 10);

    const state = {
      rows: [],
      editingId: null,
      deletingId: null,
      fieldOptionLists: new Map(),
      filterOptionLists: new Map(),
      search: "",
      includeInactive:
        listConfig.params.get("includeInactive") === "true" || config.defaultIncludeInactive === true,
      filterValues: Object.fromEntries(
        filters.map((filter) => [filter.name, filter.defaultValue ?? listConfig.params.get(filter.name) ?? ""])
      ),
      pagination: {
        take: Number.isFinite(initialTake) && initialTake > 0 ? Math.min(initialTake, 200) : (config.pageSize || 10),
        skip: 0,
        total: 0,
      },
    };

    const endpoint = config.endpoint;
    const detailEndpoint = (id) => `${endpoint}/${id}`;
    const idField = config.idField;

    function showAlert(targetId, type, msg) {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.innerHTML = `
        <div class="alert alert-${type} py-2 mb-3">
          <div class="small">${escapeHtml(msg)}</div>
        </div>
      `;
    }

    function clearAlert(targetId) {
      const el = document.getElementById(targetId);
      if (el) el.innerHTML = "";
    }

    function renderShell() {
      if (permissions.read !== true) {
        root.innerHTML = `
          <div class="sd-card p-4">
            <h4 class="mb-1">${escapeHtml(config.title)}</h4>
            <div class="alert alert-warning mb-0">
              <div class="fw-bold mb-1">Sin acceso</div>
              <div class="small">Tu perfil no tiene permisos de lectura para este modulo.</div>
            </div>
          </div>
        `;
        return;
      }

      const shouldRenderFilters =
        config.enableSearch !== false ||
        filters.length > 0 ||
        config.includeInactiveFilter !== false;

      root.innerHTML = `
        <div class="sd-card p-4">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <h4 class="mb-1">${escapeHtml(config.title)}</h4>
              <div class="sd-muted">${escapeHtml(config.description || "")}</div>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sd-outline" id="crudBtnRefresh">Refrescar</button>
              ${permissions.create === true ? '<button class="btn btn-sd" id="crudBtnNew">+ Nuevo</button>' : ""}
            </div>
          </div>

          ${
            shouldRenderFilters
              ? `
                <div class="row g-3 mt-1">
                  ${
                    config.enableSearch !== false
                      ? `
                        <div class="col-12 col-lg-4">
                          <label class="form-label">Buscar</label>
                          <input
                            class="form-control"
                            id="crudSearchInput"
                            placeholder="${escapeHtml(config.searchPlaceholder || "Buscar registros")}"
                            value="${escapeHtml(state.search)}"
                          >
                        </div>
                      `
                      : ""
                  }
                  ${filters.map((filter) => renderFilterControl(filter, state, state.filterOptionLists)).join("")}
                  ${
                    config.includeInactiveFilter !== false && global.SD_USER?.isAdmin === true
                      ? `
                        <div class="col-12 col-lg-2">
                          <label class="form-label d-block">Estado</label>
                          <div class="form-check mt-2">
                            <input class="form-check-input" type="checkbox" id="crudIncludeInactive" ${state.includeInactive ? "checked" : ""}>
                            <label class="form-check-label" for="crudIncludeInactive">Incluir inactivos</label>
                          </div>
                        </div>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }

          <div class="mt-3">
            <div id="crudAlert"></div>
            <div class="table-responsive">
              <table class="table table-sm align-middle sd-table">
                <thead>
                  <tr id="crudTableHead"></tr>
                </thead>
                <tbody id="crudTableBody"></tbody>
              </table>
            </div>
          </div>

          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div class="sd-muted small" id="crudPaginationInfo">Sin resultados</div>
            <div class="d-flex gap-2">
              <button class="btn btn-sd-outline btn-sm" id="crudBtnPrev">Anterior</button>
              <button class="btn btn-sd-outline btn-sm" id="crudBtnNext">Siguiente</button>
            </div>
          </div>
        </div>

        <div class="modal fade" id="crudModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content sd-card">
              <div class="modal-header">
                <h5 class="modal-title" id="crudModalTitle">${escapeHtml(config.title)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <div id="crudModalAlert"></div>
                <form id="crudForm" class="row g-3"></form>
                ${config.formHelp ? `<div class="sd-muted mt-2" style="font-size:12px;">${escapeHtml(config.formHelp)}</div>` : ""}
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-sd-outline" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-sd" id="crudBtnSave">Guardar</button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal fade" id="crudDeleteModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content sd-card">
              <div class="modal-header">
                <h5 class="modal-title">Confirmar</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                ¿Seguro que quieres eliminar o desactivar este registro?
                <div id="crudDeleteInfo" class="mt-2"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-sd-outline" data-bs-dismiss="modal">No</button>
                <button type="button" class="btn btn-sd" id="crudBtnDeleteConfirm">Si, continuar</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderPagination() {
      const total = Number(state.pagination.total || 0);
      const from = total ? state.pagination.skip + 1 : 0;
      const to = Math.min(state.pagination.skip + state.rows.length, total);
      const info = document.getElementById("crudPaginationInfo");
      const prev = document.getElementById("crudBtnPrev");
      const next = document.getElementById("crudBtnNext");

      if (info) {
        info.textContent = total
          ? `Mostrando ${from}-${to} de ${total} registros`
          : "Sin resultados";
      }
      if (prev) prev.disabled = state.pagination.skip <= 0;
      if (next) next.disabled = state.pagination.skip + state.pagination.take >= total;
    }

    function renderTable() {
      const head = document.getElementById("crudTableHead");
      const body = document.getElementById("crudTableBody");

      head.innerHTML = "";
      body.innerHTML = "";

      config.columns.forEach((column) => {
        const th = document.createElement("th");
        th.textContent = column.label;
        head.appendChild(th);
      });

      const thActions = document.createElement("th");
      thActions.textContent = "Acciones";
      thActions.style.width = "140px";
      head.appendChild(thActions);

      state.rows.forEach((row) => {
        const tr = document.createElement("tr");

        config.columns.forEach((column) => {
          const td = document.createElement("td");
          const value = column.render ? column.render(row) : row[column.key];
          td.textContent = displayValue(value);
          tr.appendChild(td);
        });

        const tdActions = document.createElement("td");
        const actions = [];
        if (Array.isArray(config.rowActions)) {
          config.rowActions.forEach((actionDef) => {
            const visible = typeof actionDef?.visible === "function"
              ? actionDef.visible(row, permissions) !== false
              : true;
            if (!visible) return;

            const actionName = String(actionDef?.action || "").trim();
            if (!actionName) return;

            const label = String(actionDef?.label || actionName);
            const className = String(actionDef?.className || "btn btn-sm btn-sd-outline");
            actions.push(
              `<button class="${escapeHtml(className)}" data-action="${escapeHtml(actionName)}" data-id="${escapeHtml(row[idField])}">${escapeHtml(label)}</button>`
            );
          });
        }
        if (permissions.update === true) {
          actions.push(`<button class="btn btn-sm btn-sd-outline" data-action="edit" data-id="${escapeHtml(row[idField])}">Editar</button>`);
        }
        if (permissions.delete === true) {
          actions.push(`<button class="btn btn-sm btn-sd" data-action="delete" data-id="${escapeHtml(row[idField])}">Eliminar</button>`);
        }
        tdActions.innerHTML = actions.length
          ? `<div class="d-flex gap-2">${actions.join("")}</div>`
          : '<span class="sd-muted small">Solo lectura</span>';
        tr.appendChild(tdActions);
        body.appendChild(tr);
      });

      renderPagination();
    }

    async function ensureOptionsLoaded() {
      for (const field of config.fields) {
        if (field.type !== "select") continue;
        if (state.fieldOptionLists.has(field.name)) continue;
        state.fieldOptionLists.set(field.name, await loadOptions(field));
      }

      for (const filter of filters) {
        if (filter.type !== "select") continue;
        if (state.filterOptionLists.has(filter.name)) continue;
        state.filterOptionLists.set(filter.name, await loadOptions(filter));
      }
    }

    function buildForm(record) {
      const form = document.getElementById("crudForm");
      form.innerHTML = config.fields.map((field) => renderField(field, record, state.fieldOptionLists)).join("");
    }

    function readForm() {
      const form = document.getElementById("crudForm");
      const payload = {};

      for (const field of config.fields) {
        const input = form.querySelector(`[name="${field.name}"]`);
        if (!input) continue;

        const value = parseFieldValue(field, input);
        if ((field.optionalOnUpdate || field.optional) && state.editingId && value === "") continue;
        if (field.optionalOnUpdate && state.editingId && value === null) continue;
        payload[field.name] = value;
      }

      return payload;
    }

    function buildListUrl() {
      const params = new URLSearchParams(listConfig.params.toString());
      params.set("take", String(state.pagination.take));
      params.set("skip", String(state.pagination.skip));

      if (config.enableSearch !== false && state.search) {
        params.set("q", state.search);
      } else {
        params.delete("q");
      }

      if (config.includeInactiveFilter !== false) {
        if (state.includeInactive) params.set("includeInactive", "true");
        else params.delete("includeInactive");
      }

      filters.forEach((filter) => {
        const value = state.filterValues[filter.name];
        if (value === undefined || value === null || String(value).trim() === "") {
          params.delete(filter.name);
        } else {
          params.set(filter.name, String(value).trim());
        }
      });

      const queryString = params.toString();
      return queryString ? `${listConfig.path}?${queryString}` : listConfig.path;
    }

    function syncFiltersFromDom() {
      if (config.enableSearch !== false) {
        state.search = document.getElementById("crudSearchInput")?.value.trim() || "";
      }

      if (config.includeInactiveFilter !== false) {
        state.includeInactive = document.getElementById("crudIncludeInactive")?.checked === true;
      }

      filters.forEach((filter) => {
        const input = root.querySelector(`[data-filter-name="${filter.name}"]`);
        state.filterValues[filter.name] = input?.value ?? "";
      });
    }

    async function loadRows({ resetPaging = false } = {}) {
      clearAlert("crudAlert");
      syncFiltersFromDom();
      if (resetPaging) state.pagination.skip = 0;

      const response = await global.SD_API.request(buildListUrl());
      state.rows = Array.isArray(response?.data) ? response.data : [];
      const paginationMeta = buildPaginationMeta(state, response);
      state.pagination.total = paginationMeta.total;
      renderTable();
    }

    async function openCreate() {
      state.editingId = null;
      clearAlert("crudModalAlert");
      document.getElementById("crudModalTitle").textContent = config.createTitle || `Nuevo ${config.title}`;
      await ensureOptionsLoaded();
      buildForm(config.defaults || {});
      bootstrap.Modal.getOrCreateInstance(document.getElementById("crudModal")).show();
    }

    async function openEdit(id) {
      clearAlert("crudModalAlert");
      state.editingId = id;
      document.getElementById("crudModalTitle").textContent = config.editTitle || `Editar ${config.title}`;
      await ensureOptionsLoaded();
      const response = await global.SD_API.request(detailEndpoint(id));
      buildForm(response?.data || {});
      bootstrap.Modal.getOrCreateInstance(document.getElementById("crudModal")).show();
    }

    async function saveRecord() {
      clearAlert("crudModalAlert");

      try {
        const form = document.getElementById("crudForm");
        if (form && !form.reportValidity()) return;

        const payload = readForm();
        if (config.beforeSave) {
          await config.beforeSave(payload, state);
        }

        if (state.editingId) {
          await global.SD_API.request(detailEndpoint(state.editingId), {
            method: "PUT",
            body: payload,
          });
        } else {
          await global.SD_API.request(endpoint, {
            method: "POST",
            body: payload,
          });
        }

        bootstrap.Modal.getInstance(document.getElementById("crudModal"))?.hide();
        await loadRows();
        showAlert("crudAlert", "success", "Guardado correctamente.");
      } catch (err) {
        showAlert("crudModalAlert", "danger", err?.error || err?.message || "Error guardando registro");
      }
    }

    function openDelete(id) {
      state.deletingId = id;
      document.getElementById("crudDeleteInfo").innerHTML = `<div class="sd-muted small">ID: <b>${escapeHtml(id)}</b></div>`;
      bootstrap.Modal.getOrCreateInstance(document.getElementById("crudDeleteModal")).show();
    }

    async function confirmDelete() {
      if (!state.deletingId) return;

      try {
        await global.SD_API.request(detailEndpoint(state.deletingId), { method: "DELETE" });
        bootstrap.Modal.getInstance(document.getElementById("crudDeleteModal"))?.hide();
        await loadRows();
        showAlert("crudAlert", "success", "Registro actualizado correctamente.");
      } catch (err) {
        showAlert("crudAlert", "danger", err?.error || err?.message || "Error eliminando registro");
      }
    }

    renderShell();
    if (permissions.read !== true) return;
    await ensureOptionsLoaded();
    renderShell();
    await loadRows({ resetPaging: true });

    root.addEventListener("click", function (e) {
      const actionButton = e.target.closest("[data-action]");
      if (actionButton) {
        e.preventDefault();
        const action = actionButton.getAttribute("data-action");
        const id = actionButton.getAttribute("data-id");
        const row = state.rows.find((item) => String(item?.[idField]) === String(id));
        if (action === "edit") {
          openEdit(id).catch((err) => {
            showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo cargar el registro");
          });
          return;
        }
        if (action === "delete") {
          openDelete(id);
          return;
        }

        if (typeof config.onRowAction === "function") {
          Promise.resolve(config.onRowAction({ action, id, row, state, permissions }))
            .catch((err) => {
              showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo ejecutar la accion");
            });
        }
        return;
      }

      if (e.target.id === "crudBtnRefresh") {
        loadRows({ resetPaging: true }).catch((err) => {
          showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo refrescar la tabla");
        });
      }
      if (e.target.id === "crudBtnNew") {
        openCreate().catch((err) => {
          showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo abrir el formulario");
        });
      }
      if (e.target.id === "crudBtnSave") saveRecord();
      if (e.target.id === "crudBtnDeleteConfirm") confirmDelete();
      if (e.target.id === "crudBtnPrev") {
        if (state.pagination.skip <= 0) return;
        state.pagination.skip = Math.max(0, state.pagination.skip - state.pagination.take);
        loadRows().catch((err) => {
          showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo cambiar la pagina");
        });
      }
      if (e.target.id === "crudBtnNext") {
        if (state.pagination.skip + state.pagination.take >= state.pagination.total) return;
        state.pagination.skip += state.pagination.take;
        loadRows().catch((err) => {
          showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo cambiar la pagina");
        });
      }
    });

    root.addEventListener("change", function (e) {
      if (e.target.id === "crudIncludeInactive" || e.target.matches("[data-filter-name]")) {
        loadRows({ resetPaging: true }).catch((err) => {
          showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo aplicar el filtro");
        });
      }
    });

    root.addEventListener("keydown", function (e) {
      if (e.target.id === "crudSearchInput" && e.key === "Enter") {
        e.preventDefault();
        loadRows({ resetPaging: true }).catch((err) => {
          showAlert("crudAlert", "danger", err?.error || err?.message || "No se pudo buscar");
        });
      }
    });
  }

  global.SD_CRUD = { mount };
})(window);
