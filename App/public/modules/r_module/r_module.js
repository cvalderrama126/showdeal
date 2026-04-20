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

async function init_r_module() {
  await window.SD_CRUD.mount({
    title: "Módulos",
    description: "Catálogo de módulos funcionales del sistema (nombre visible + clave técnica).",
    endpoint: "/api/r_module",
    listEndpoint: "/api/r_module?includeInactive=true&take=200",
    idField: "id_module",
    pageSize: 10,
    searchPlaceholder: "Buscar por nombre de modulo",
    formHelp: "Marca is_admin para módulos administrativos.",
    filters: [
      {
        name: "is_admin",
        label: "Administrativo",
        type: "select",
        options: [
          { value: "true", label: "Si" },
          { value: "false", label: "No" },
        ],
      },
    ],
    columns: [
      { key: "id_module", label: "ID" },
      { key: "module", label: "Nombre", render: (row) => moduleLabel(row.module) },
      { key: "module", label: "Clave técnica" },
      { key: "is_admin", label: "Admin" },
      { key: "is_active", label: "Activo" },
    ],
    defaults: {
      is_admin: false,
      is_active: true,
    },
    fields: [
      { name: "module", label: "Clave técnica del módulo", type: "text", required: true },
      { name: "is_admin", label: "Es administrativo", type: "checkbox" },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
