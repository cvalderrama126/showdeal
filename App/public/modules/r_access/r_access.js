const MODULE_LABELS = {
  r_auction: "Ofertas Judiciales",
  r_asset: "Activos",
  r_attach: "Adjuntos",
  r_event: "Eventos",
  r_bid: "Resultados",
  r_module: "Módulos",
  r_company: "Compañías",
  r_role: "Roles",
  r_user: "Usuarios",
  r_access: "Accesos",
  r_connection: "Conexiones",
  r_invitation: "Invitaciones",
  r_log: "Logs",
};

function moduleLabel(moduleKey) {
  return MODULE_LABELS[moduleKey] || moduleKey;
}

async function init_r_access() {
  const moduleById = new Map();
  const roleById = new Map();

  async function loadLookups() {
    const [modulesResponse, rolesResponse] = await Promise.all([
      window.SD_API.request("/api/r_module?includeInactive=true&take=200"),
      window.SD_API.request("/api/r_role?includeInactive=true&take=200"),
    ]);

    const modules = Array.isArray(modulesResponse?.data) ? modulesResponse.data : [];
    const roles = Array.isArray(rolesResponse?.data) ? rolesResponse.data : [];

    moduleById.clear();
    roleById.clear();

    modules.forEach((row) => moduleById.set(String(row.id_module), row));
    roles.forEach((row) => roleById.set(String(row.id_role), row));
  }

  function moduleDisplayById(idModule) {
    const row = moduleById.get(String(idModule));
    if (!row) return String(idModule ?? "");
    return `${moduleLabel(row.module)} (${row.module})`;
  }

  function roleDisplayById(idRole) {
    const row = roleById.get(String(idRole));
    if (!row) return String(idRole ?? "");
    return `${row.role} (#${row.id_role})`;
  }

  await loadLookups();

  await window.SD_CRUD.mount({
    title: "Accesos",
    description: "Permisos CRUD por módulo y rol.",
    endpoint: "/api/r_access",
    listEndpoint: "/api/r_access?includeInactive=true&take=200",
    idField: "id_access",
    pageSize: 10,
    enableSearch: false,
    formHelp: "Usa esta pantalla para definir create, update y delete por módulo. Additional es opcional.",
    filters: [
      {
        name: "id_module",
        label: "Módulo",
        type: "select",
        optionsEndpoint: "/api/r_module?includeInactive=true&take=200",
        optionValueKey: "id_module",
        optionLabel: (row) => `${row.id_module} · ${moduleLabel(row.module)} (${row.module})`,
      },
      {
        name: "id_role",
        label: "Rol",
        type: "select",
        optionsEndpoint: "/api/r_role?includeInactive=true&take=200",
        optionValueKey: "id_role",
        optionLabel: (row) => `${row.id_role} · ${row.role}`,
      },
    ],
    columns: [
      { key: "id_access", label: "ID" },
      { key: "id_module", label: "Módulo", render: (row) => moduleDisplayById(row.id_module) },
      { key: "id_role", label: "Rol", render: (row) => roleDisplayById(row.id_role) },
      { key: "is_insert", label: "Crear" },
      { key: "is_update", label: "Editar" },
      { key: "is_delete", label: "Eliminar" },
      { key: "is_active", label: "Activo" },
    ],
    defaults: {
      is_insert: false,
      is_update: false,
      is_delete: false,
      is_active: true,
    },
    fields: [
      {
        name: "id_module",
        label: "Módulo",
        type: "select",
        required: true,
        optionsEndpoint: "/api/r_module?includeInactive=true&take=200",
        optionValueKey: "id_module",
        optionLabel: (row) => `${row.id_module} · ${moduleLabel(row.module)} (${row.module})`,
      },
      {
        name: "id_role",
        label: "Rol",
        type: "select",
        required: true,
        optionsEndpoint: "/api/r_role?includeInactive=true&take=200",
        optionValueKey: "id_role",
        optionLabel: (row) => `${row.id_role} · ${row.role}`,
      },
      { name: "is_insert", label: "Permite crear", type: "checkbox" },
      { name: "is_update", label: "Permite editar", type: "checkbox" },
      { name: "is_delete", label: "Permite eliminar", type: "checkbox" },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
