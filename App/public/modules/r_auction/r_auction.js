async function init_r_auction() {
  await window.SD_CRUD.mount({
    title: "Ofertas Judiciales",
    description: "Relación entre eventos y activos puestos en subasta.",
    endpoint: "/api/r_auction",
    listEndpoint: "/api/r_auction?includeInactive=true&take=200",
    idField: "id_auction",
    pageSize: 10,
    enableSearch: false,
    formHelp: "Cada subasta conecta un evento y un activo.",
    filters: [
      {
        name: "tp_auction",
        label: "Tipo",
        type: "select",
        options: [
          { value: "SEALED_BID", label: "Sobre cerrado" },
          { value: "LIVE_AUCTION", label: "En vivo" },
        ],
      },
      {
        name: "id_event",
        label: "Evento",
        type: "select",
        optionsEndpoint: "/api/r_event?includeInactive=true&take=200",
        optionValueKey: "id_event",
        optionLabel: (row) => `${row.id_event} · ${row.tp_event}`,
      },
      {
        name: "id_asset",
        label: "Activo",
        type: "select",
        optionsEndpoint: "/api/r_asset?includeInactive=true&take=200",
        optionValueKey: "id_asset",
        optionLabel: (row) => `${row.id_asset} · ${row.uin}`,
      },
    ],
    columns: [
      { key: "id_auction", label: "ID" },
      { key: "tp_auction", label: "Tipo" },
      { key: "id_event", label: "Evento" },
      { key: "id_asset", label: "Activo" },
      { key: "is_active", label: "Activo" },
    ],
    defaults: {
      tp_auction: "SEALED_BID",
      is_active: true,
    },
    fields: [
      {
        name: "tp_auction",
        label: "Tipo de subasta",
        type: "select",
        required: true,
        options: [
          { value: "SEALED_BID", label: "Sobre cerrado" },
          { value: "LIVE_AUCTION", label: "En vivo" },
        ],
      },
      {
        name: "id_event",
        label: "Evento",
        type: "select",
        required: true,
        optionsEndpoint: "/api/r_event?includeInactive=true&take=200",
        optionValueKey: "id_event",
        optionLabel: (row) => `${row.id_event} · ${row.tp_event}`,
      },
      {
        name: "id_asset",
        label: "Activo",
        type: "select",
        required: true,
        optionsEndpoint: "/api/r_asset?includeInactive=true&take=200",
        optionValueKey: "id_asset",
        optionLabel: (row) => `${row.id_asset} · ${row.uin} · ${row.status}`,
      },
      { name: "is_active", label: "Activo", type: "checkbox" },
    ],
  });
}
