async function init_r_bid() {
  await window.SD_CRUD.mount({
    title: "Resultados",
    description: "Pujas registradas por usuario en cada subasta.",
    endpoint: "/api/r_bid",
    listEndpoint: "/api/r_bid?includeInactive=true&take=200",
    idField: "id_bid",
    pageSize: 10,
    enableSearch: false,
    formHelp: "Selecciona subasta y usuario para registrar una puja.",
    filters: [
      {
        name: "id_auction",
        label: "Subasta",
        type: "select",
        optionsEndpoint: "/api/r_auction?includeInactive=true&take=200",
        optionValueKey: "id_auction",
        optionLabel: (row) => `${row.id_auction} · ${row.tp_auction}`,
      },
      {
        name: "id_user",
        label: "Usuario",
        type: "select",
        optionsEndpoint: "/api/r_user?includeInactive=true&take=200",
        optionValueKey: "id_user",
        optionLabel: (row) => `${row.user} · ${row.name}`,
      },
    ],
    columns: [
      { key: "id_bid", label: "ID" },
      { key: "id_auction", label: "Subasta" },
      { key: "id_user", label: "Usuario" },
      { key: "value", label: "Valor" },
      { key: "is_active", label: "Activo" },
    ],
    defaults: {
      value: "0",
      is_active: true,
    },
    fields: [
      {
        name: "id_auction",
        label: "Subasta",
        type: "select",
        required: true,
        optionsEndpoint: "/api/r_auction?includeInactive=true&take=200",
        optionValueKey: "id_auction",
        optionLabel: (row) => `${row.id_auction} · ${row.tp_auction} · evento ${row.id_event}`,
      },
      {
        name: "id_user",
        label: "Usuario",
        type: "select",
        required: true,
        optionsEndpoint: "/api/r_user?includeInactive=true&take=200",
        optionValueKey: "id_user",
        optionLabel: (row) => `${row.user} · ${row.name}`,
      },
      { name: "value", label: "Valor", type: "number", step: "0.01", required: true },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
