async function init_r_company() {
  await window.SD_CRUD.mount({
    title: "Compañías",
    description: "Catálogo de compañías vinculadas al ecosistema ShowDeal.",
    endpoint: "/api/r_company",
    listEndpoint: "/api/r_company?includeInactive=true&take=200",
    idField: "id_company",
    pageSize: 10,
    searchPlaceholder: "Buscar por UIN o nombre de compania",
    formHelp: "Completa UIN y nombre de la compañía.",
    columns: [
      { key: "id_company", label: "ID" },
      { key: "uin", label: "UIN" },
      { key: "company", label: "Compañía" },
      { key: "is_active", label: "Activo" },
    ],
    defaults: {
      is_active: true,
    },
    fields: [
      { name: "uin", label: "UIN", type: "text", required: true },
      { name: "company", label: "Nombre compañía", type: "text", required: true },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
