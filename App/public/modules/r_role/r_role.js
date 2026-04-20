async function init_r_role() {
  await window.SD_CRUD.mount({
    title: "Roles",
    description: "Catálogo de roles de usuario y perfiles operativos.",
    endpoint: "/api/r_role",
    listEndpoint: "/api/r_role?includeInactive=true&take=200",
    idField: "id_role",
    pageSize: 10,
    searchPlaceholder: "Buscar por nombre de rol",
    formHelp: "Define el nombre del rol y su estado.",
    columns: [
      { key: "id_role", label: "ID" },
      { key: "role", label: "Rol" },
      { key: "is_active", label: "Activo" },
    ],
    defaults: {
      is_active: true,
    },
    fields: [
      { name: "role", label: "Nombre del rol", type: "text", required: true },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
