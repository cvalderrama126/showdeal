async function init_r_user() {
  const TABLE_COLUMNS = ["id_user", "user", "name", "company_name", "role_name", "is_active", "otp_enabled", "password_expires"];
  const PAGE_SIZE = 10;
  const permissions = window.SD_PERMISSIONS?.r_user || {
    read: true,
    create: true,
    update: true,
    delete: true,
  };

  function showAlert(targetId, type, msg) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${msg}</div>
      </div>
    `;
  }

  function renderNoAccess() {
    document.getElementById("appContent").innerHTML = `
      <div class="sd-card p-4">
        <h4 class="mb-1">Usuarios</h4>
        <div class="alert alert-warning mb-0">
          <div class="fw-bold mb-1">Sin acceso</div>
          <div class="small">Tu usuario no tiene permisos de lectura para este módulo.</div>
        </div>
      </div>
    `;
  }

  function clearAlert(targetId) {
    const el = document.getElementById(targetId);
    if (el) el.innerHTML = "";
  }

  function todayYmd() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options) {
    if (!window.SD_API?.request) {
      throw new Error("SD_API no esta disponible.");
    }
    return window.SD_API.request(path, options);
  }

  const state = {
    rows: [],
    options: {
      companies: [],
      roles: [],
    },
    filters: {
      q: "",
      id_company: "",
      id_role: "",
      includeInactive: true,
    },
    pagination: {
      take: PAGE_SIZE,
      skip: 0,
      total: 0,
    },
    editingId: null,
    deletingId: null,
    otpUser: null,
  };

  const userModal = new bootstrap.Modal(document.getElementById("userModal"));
  const confirmDelModal = new bootstrap.Modal(document.getElementById("confirmDelModal"));
  const otpModal = new bootstrap.Modal(document.getElementById("otpModal"));

  function getCompanyLabel(id) {
    const found = state.options.companies.find((item) => String(item.id_company) === String(id));
    return found?.company || id || "";
  }

  function getRoleLabel(id) {
    const found = state.options.roles.find((item) => String(item.id_role) === String(id));
    return found?.role || id || "";
  }

  function optionMarkup(items, idKey, labelKey, selected) {
    return items
      .map((item) => {
        const value = item[idKey];
        const label = item[labelKey];
        const isSelected = String(value) === String(selected ?? "");
        return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function renderFilterOptions() {
    const companyFilter = document.getElementById("usersFilterCompany");
    const roleFilter = document.getElementById("usersFilterRole");

    companyFilter.innerHTML = `
      <option value="">Todas</option>
      ${optionMarkup(state.options.companies, "id_company", "company", state.filters.id_company)}
    `;

    roleFilter.innerHTML = `
      <option value="">Todos</option>
      ${optionMarkup(state.options.roles, "id_role", "role", state.filters.id_role)}
    `;
  }

  function tableCellValue(row, key) {
    switch (key) {
      case "company_name":
        return row.company_name || getCompanyLabel(row.id_company);
      case "role_name":
        return row.role_name || getRoleLabel(row.id_role);
      case "is_active":
      case "otp_enabled":
        return row[key] === true ? "Si" : "No";
      case "password_expires":
        return row.password_meta?.expired || "";
      default:
        return row?.[key] ?? "";
    }
  }

  function buildForm(values = {}) {
    const isEdit = state.editingId !== null && state.editingId !== undefined;
    const form = document.getElementById("userForm");
    const passwordMeta = values.password_meta || {};
    const passwordCreated = passwordMeta.created || todayYmd();
    const passwordExpires = passwordMeta.expired || "";

    form.innerHTML = `
      <div class="col-12 col-md-6">
        <label class="form-label">Compañía</label>
        <select class="form-select" name="id_company" required>
          <option value="">Selecciona...</option>
          ${optionMarkup(state.options.companies, "id_company", "company", values.id_company)}
        </select>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Rol</label>
        <select class="form-select" name="id_role" required>
          <option value="">Selecciona...</option>
          ${optionMarkup(state.options.roles, "id_role", "role", values.id_role)}
        </select>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Documento / UIN</label>
        <input class="form-control" name="uin" value="${escapeHtml(values.uin ?? "")}" required />
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Usuario</label>
        <input class="form-control" name="user" value="${escapeHtml(values.user ?? values.user_1 ?? "")}" required />
      </div>
      <div class="col-12">
        <label class="form-label">Nombre</label>
        <input class="form-control" name="name" value="${escapeHtml(values.name ?? "")}" required />
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Nueva contraseña</label>
        <input class="form-control" type="password" name="password" minlength="8" ${isEdit ? "" : "required"} autocomplete="new-password" />
      </div>
      <div class="col-12 col-md-3">
        <label class="form-label">Fecha creación</label>
        <input class="form-control" type="date" name="password_created" value="${escapeHtml(passwordCreated)}" />
      </div>
      <div class="col-12 col-md-3">
        <label class="form-label">Vence</label>
        <input class="form-control" type="date" name="password_expires" value="${escapeHtml(passwordExpires)}" />
      </div>
      <div class="col-12 col-md-6">
        <div class="form-check mt-4">
          <input class="form-check-input" type="checkbox" id="f_is_active" name="is_active" ${values.is_active !== false ? "checked" : ""}>
          <label class="form-check-label" for="f_is_active">Activo</label>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="sd-muted small mt-4">
          OTP habilitado: <b>${values.otp_enabled === true ? "Si" : "No"}</b><br>
          Última credencial: <b>${escapeHtml(passwordMeta.created || "sin datos")}</b>
        </div>
      </div>
    `;
  }

  function readForm() {
    const form = document.getElementById("userForm");

    return {
      id_company: form.querySelector('[name="id_company"]').value,
      id_role: form.querySelector('[name="id_role"]').value,
      uin: form.querySelector('[name="uin"]').value.trim(),
      user: form.querySelector('[name="user"]').value.trim(),
      name: form.querySelector('[name="name"]').value.trim(),
      is_active: form.querySelector('[name="is_active"]').checked,
      password: form.querySelector('[name="password"]').value,
      password_created: form.querySelector('[name="password_created"]').value || null,
      password_expires: form.querySelector('[name="password_expires"]').value || null,
    };
  }

  function renderTable() {
    const head = document.getElementById("tblUsersHead");
    const body = document.getElementById("tblUsersBody");

    head.innerHTML = "";
    body.innerHTML = "";

    TABLE_COLUMNS.forEach((colName) => {
      const th = document.createElement("th");
      th.textContent = colName;
      head.appendChild(th);
    });

    const thActions = document.createElement("th");
    thActions.textContent = "Acciones";
    thActions.style.width = "220px";
    head.appendChild(thActions);

    state.rows.forEach((row) => {
      const tr = document.createElement("tr");

      TABLE_COLUMNS.forEach((key) => {
        const td = document.createElement("td");
        td.textContent = tableCellValue(row, key);
        tr.appendChild(td);
      });

      const tdActions = document.createElement("td");
      const actions = [];
      if (permissions.update === true) {
        actions.push('<button class="btn btn-sm btn-sd-outline" data-act="edit">Editar</button>');
        actions.push('<button class="btn btn-sm btn-sd-outline" data-act="otp">OTP</button>');
      }
      if (permissions.delete === true) {
        actions.push('<button class="btn btn-sm btn-sd" data-act="del">Eliminar</button>');
      }

      tdActions.innerHTML = actions.length
        ? `<div class="d-flex gap-2">${actions.join("")}</div>`
        : '<span class="sd-muted small">Solo lectura</span>';

      tdActions.querySelector('[data-act="edit"]')?.addEventListener("click", () => openEdit(row));
  tdActions.querySelector('[data-act="otp"]')?.addEventListener("click", () => openOtp(row));
      tdActions.querySelector('[data-act="del"]')?.addEventListener("click", () => openDelete(row));
      tr.appendChild(tdActions);

      body.appendChild(tr);
    });

    renderPagination();
  }

  function renderPagination() {
    const info = document.getElementById("usersPaginationInfo");
    const btnPrev = document.getElementById("btnUsersPrev");
    const btnNext = document.getElementById("btnUsersNext");
    const total = Number(state.pagination.total || 0);
    const from = total ? state.pagination.skip + 1 : 0;
    const to = Math.min(state.pagination.skip + state.rows.length, total);

    info.textContent = total
      ? `Mostrando ${from}-${to} de ${total} registros`
      : "Sin resultados";

    btnPrev.disabled = state.pagination.skip <= 0;
    btnNext.disabled = state.pagination.skip + state.pagination.take >= total;
  }

  async function loadOptions() {
    const response = await api("/api/r_user/meta/options");
    state.options = response?.data || { companies: [], roles: [] };
    renderFilterOptions();
  }

  function readFilters() {
    state.filters.q = document.getElementById("usersFilterSearch").value.trim();
    state.filters.id_company = document.getElementById("usersFilterCompany").value;
    state.filters.id_role = document.getElementById("usersFilterRole").value;
    state.filters.includeInactive = document.getElementById("usersFilterInactive").checked;
  }

  async function loadUsers({ resetPaging = false } = {}) {
    clearAlert("usersAlert");

    try {
      readFilters();
      if (resetPaging) state.pagination.skip = 0;

      const params = new URLSearchParams();
      params.set("take", String(state.pagination.take));
      params.set("skip", String(state.pagination.skip));
      if (state.filters.includeInactive) params.set("includeInactive", "true");
      if (state.filters.q) params.set("q", state.filters.q);
      if (state.filters.id_company) params.set("id_company", state.filters.id_company);
      if (state.filters.id_role) params.set("id_role", state.filters.id_role);

      const response = await api(`/api/r_user?${params.toString()}`);
      state.rows = Array.isArray(response?.data) ? response.data : [];
      state.pagination.total = Number(response?.meta?.total || state.rows.length || 0);
      renderTable();
    } catch (err) {
      showAlert("usersAlert", "danger", err?.error || err?.message || "Error cargando usuarios");
    }
  }

  function openCreate() {
    state.editingId = null;
    clearAlert("userModalAlert");
    document.getElementById("userModalTitle").textContent = "Nuevo usuario";
    buildForm({
      is_active: true,
      otp_enabled: false,
      password_meta: {
        created: todayYmd(),
      },
    });
    userModal.show();
  }

  async function openEdit(row) {
    clearAlert("userModalAlert");
    state.editingId = row?.id_user;
    document.getElementById("userModalTitle").textContent = "Editar usuario";

    try {
      const response = await api(`/api/r_user/${row.id_user}`);
      buildForm(response?.data || row || {});
      userModal.show();
    } catch (err) {
      showAlert("usersAlert", "danger", err?.error || err?.message || "No se pudo cargar el detalle del usuario");
    }
  }

  async function saveUser() {
    clearAlert("userModalAlert");

    try {
      const form = document.getElementById("userForm");
      if (form && !form.reportValidity()) return;

      const payload = readForm();

      if (state.editingId === null || state.editingId === undefined) {
        await api("/api/r_user", { method: "POST", body: payload });
      } else {
        if (!payload.password) delete payload.password;
        await api(`/api/r_user/${state.editingId}`, { method: "PUT", body: payload });
      }

      userModal.hide();
      await loadUsers();
      showAlert("usersAlert", "success", "Guardado correctamente.");
    } catch (err) {
      showAlert("userModalAlert", "danger", err?.error || err?.message || "Error guardando usuario");
    }
  }

  function openDelete(row) {
    state.deletingId = row?.id_user;
    document.getElementById("confirmDelInfo").innerHTML = `
      <div class="sd-muted small">ID: <b>${state.deletingId}</b></div>
      <div class="sd-muted small">Usuario: <b>${row?.user || ""}</b></div>
    `;
    confirmDelModal.show();
  }

  async function doDelete() {
    if (state.deletingId === null || state.deletingId === undefined) return;

    try {
      await api(`/api/r_user/${state.deletingId}`, { method: "DELETE" });
      confirmDelModal.hide();
      await loadUsers();
      showAlert("usersAlert", "success", "Usuario desactivado correctamente.");
    } catch (err) {
      showAlert("usersAlert", "danger", err?.error || err?.message || "Error eliminando usuario");
    }
  }

  async function openOtp(row) {
    state.otpUser = row || null;
    clearAlert("otpModalAlert");
    document.getElementById("otpCode").value = "";
    document.getElementById("otpSecret").value = "";
    document.getElementById("otpAuthUrl").value = "";
    document.getElementById("otpModalTitle").textContent = row?.otp_enabled ? "Administrar OTP" : "Habilitar OTP";
    document.getElementById("otpModalUserInfo").innerHTML = `Usuario: <b>${escapeHtml(row?.user || "")}</b> (ID ${escapeHtml(row?.id_user || "")})`;
    
    // Show/hide disable button
    const btnDisable = document.getElementById("btnDisableOtp");
    if (row?.otp_enabled) {
      btnDisable.style.display = "inline-block";
      document.getElementById("otpCode").style.display = "none";
      document.getElementById("otpAuthUrl").parentElement.style.display = "none";
      document.getElementById("otpSecret").parentElement.style.display = "none";
      document.getElementById("btnEnableOtp").textContent = "OTP ya habilitado";
      document.getElementById("btnEnableOtp").disabled = true;
      showAlert("otpModalAlert", "success", "OTP está habilitado para este usuario.");
    } else {
      btnDisable.style.display = "none";
      document.getElementById("otpCode").style.display = "block";
      document.getElementById("otpAuthUrl").parentElement.style.display = "block";
      document.getElementById("otpSecret").parentElement.style.display = "block";
      document.getElementById("btnEnableOtp").textContent = "Habilitar OTP";
      document.getElementById("btnEnableOtp").disabled = false;
    }

    if (!row?.otp_enabled) {
      try {
        const setup = await api(`/auth/otp/setup/${row.id_user}`, { method: "POST" });
        document.getElementById("otpSecret").value = setup?.secret || "";
        document.getElementById("otpAuthUrl").value = setup?.otpauth_url || "";
        showAlert("otpModalAlert", "info", "OTP configurado. Ingresa el código generado para habilitarlo.");
      } catch (err) {
        showAlert("usersAlert", "danger", err?.error || err?.message || "No se pudo iniciar la configuración OTP");
      }
    }
    
    otpModal.show();
  }

  async function enableOtp() {
    clearAlert("otpModalAlert");
    const otp = String(document.getElementById("otpCode").value || "").trim();
    const idUser = state.otpUser?.id_user;

    if (!idUser) {
      showAlert("otpModalAlert", "danger", "No hay usuario seleccionado");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      showAlert("otpModalAlert", "warning", "Debes ingresar un código OTP válido de 6 dígitos.");
      return;
    }

    try {
      await api(`/auth/otp/enable/${idUser}`, { method: "POST", body: { otp } });
      otpModal.hide();
      await loadUsers();
      showAlert("usersAlert", "success", "OTP habilitado correctamente para el usuario.");
    } catch (err) {
      showAlert("otpModalAlert", "danger", err?.error || err?.message || "No se pudo habilitar OTP");
    }
  }

  async function disableOtp() {
    const idUser = state.otpUser?.id_user;
    if (!idUser) {
      showAlert("otpModalAlert", "danger", "No hay usuario seleccionado");
      return;
    }

    if (!confirm("¿Estás seguro de que deseas deshabilitar OTP para este usuario? Necesitará volver a configurarlo para iniciar sesión.")) {
      return;
    }

    try {
      await api(`/auth/otp/disable/${idUser}`, { method: "POST" });
      otpModal.hide();
      await loadUsers();
      showAlert("usersAlert", "success", "OTP deshabilitado correctamente para el usuario.");
    } catch (err) {
      showAlert("otpModalAlert", "danger", err?.error || err?.message || "No se pudo deshabilitar OTP");
    }
  }

  document.getElementById("btnRefreshUsers").addEventListener("click", loadUsers);
  document.getElementById("btnNewUser").addEventListener("click", openCreate);
  document.getElementById("btnSaveUser").addEventListener("click", saveUser);
  document.getElementById("btnConfirmDelete").addEventListener("click", doDelete);
  document.getElementById("usersFilterCompany").addEventListener("change", () => loadUsers({ resetPaging: true }));
  document.getElementById("usersFilterRole").addEventListener("change", () => loadUsers({ resetPaging: true }));
  document.getElementById("usersFilterInactive").addEventListener("change", () => loadUsers({ resetPaging: true }));
  document.getElementById("usersFilterSearch").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadUsers({ resetPaging: true });
  });
  document.getElementById("btnUsersPrev").addEventListener("click", () => {
    if (state.pagination.skip <= 0) return;
    state.pagination.skip = Math.max(0, state.pagination.skip - state.pagination.take);
    loadUsers();
  });
  document.getElementById("btnUsersNext").addEventListener("click", () => {
    if (state.pagination.skip + state.pagination.take >= state.pagination.total) return;
    state.pagination.skip += state.pagination.take;
    loadUsers();
  });
  document.getElementById("btnEnableOtp").addEventListener("click", enableOtp);
  document.getElementById("btnDisableOtp").addEventListener("click", disableOtp);

  if (permissions.read !== true) {
    renderNoAccess();
    return;
  }

  if (permissions.create !== true) {
    document.getElementById("btnNewUser").hidden = true;
  }

  try {
    await loadOptions();
    await loadUsers({ resetPaging: true });
  } catch (err) {
    showAlert("usersAlert", "danger", err?.error || err?.message || "No se pudo inicializar el módulo de usuarios");
  }
}
