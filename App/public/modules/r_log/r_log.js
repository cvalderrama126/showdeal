function readLogPath(source, keys, fallback = "") {
  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) return fallback;
    current = current[key];
  }
  if (current === null || current === undefined) return fallback;
  return String(current);
}

function compactJson(value) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function init_r_log() {
  const roleName = String(window.SD_USER?.roleName || "").trim().toLowerCase();
  const isAuditor = roleName.includes("auditor") || roleName.includes("audit");
  if (isAuditor) {
    window.SD_PERMISSIONS = window.SD_PERMISSIONS || {};
    window.SD_PERMISSIONS.r_log = {
      read: true,
      create: false,
      update: false,
      delete: false,
    };
  }

  await window.SD_CRUD.mount({
    title: "Trazabilidad y auditoria",
    description: "Consulta acciones realizadas por los usuarios en el sistema.",
    endpoint: "/api/r_log",
    listEndpoint: "/api/r_log/audit-trail?take=100",
    idField: "id_log",
    pageSize: 20,
    permissionModule: "r_log",
    enableSearch: false,
    includeInactiveFilter: false,
    searchPlaceholder: "Filtra por usuario, accion o modulo",
    filters: [
      {
        name: "actorId",
        label: "ID usuario",
        type: "text",
        placeholder: "Ej: 43",
      },
      {
        name: "actorLogin",
        label: "Usuario",
        type: "text",
        placeholder: "Ej: Comprador04",
      },
      {
        name: "action",
        label: "Accion",
        type: "text",
        placeholder: "Ej: USER_UPDATE",
      },
    ],
    columns: [
      {
        key: "ins_at",
        label: "Fecha",
        render: (row) => {
          const raw = row?.ins_at;
          if (!raw) return "";
          const date = new Date(raw);
          if (Number.isNaN(date.getTime())) return String(raw);
          return date.toLocaleString();
        },
      },
      { key: "tp_log", label: "Tipo" },
      {
        key: "actor",
        label: "Usuario",
        render: (row) => readLogPath(row?.log, ["actor", "login"], "-"),
      },
      {
        key: "actor_id",
        label: "ID Actor",
        render: (row) => readLogPath(row?.log, ["actor", "id_user"], "-"),
      },
      {
        key: "entity",
        label: "Entidad",
        render: (row) => readLogPath(row?.log, ["entity"], "-"),
      },
      {
        key: "entity_id",
        label: "ID Entidad",
        render: (row) => readLogPath(row?.log, ["entity_id"], "-"),
      },
      {
        key: "path",
        label: "Ruta",
        render: (row) => readLogPath(row?.log, ["context", "path"], "-"),
      },
      {
        key: "method",
        label: "Metodo",
        render: (row) => readLogPath(row?.log, ["context", "method"], "-"),
      },
      {
        key: "data",
        label: "Detalle",
        render: (row) => {
          const payload = row?.log?.data;
          const text = compactJson(payload);
          if (text.length <= 160) return text;
          return `${text.slice(0, 160)}...`;
        },
      },
    ],
    fields: [],
  });
}
