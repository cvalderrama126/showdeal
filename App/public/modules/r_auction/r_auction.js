async function init_r_auction() {
  const root = document.getElementById("judicialLotsRoot") || document.getElementById("crudModuleRoot");
  if (!root) return;

  const state = {
    companies: [],
    lots: [],
    invitationsByEvent: new Map(),
    auctionsByEvent: new Map(),
    creating: false,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dateInputToIso(value) {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }

  function prettyDate(value) {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function lotName(row) {
    const additional = row?.additional && typeof row.additional === "object" ? row.additional : {};
    return additional.lot_name || additional.nombre_lote || `Lote #${row.id_event}`;
  }

  function lotDescription(row) {
    const additional = row?.additional && typeof row.additional === "object" ? row.additional : {};
    return additional.lot_description || additional.descripcion || "Sin descripción";
  }

  function statusBadge(event) {
    const now = Date.now();
    const start = new Date(event.start_at || 0).getTime();
    const end = new Date(event.end_at || 0).getTime();

    if (event.is_active !== true) return "Inactivo";
    if (Number.isFinite(start) && now < start) return "Programado";
    if (Number.isFinite(end) && now > end) return "Cerrado";
    return "Vigente";
  }

  function getSelectedValues(select) {
    return Array.from(select?.selectedOptions || [])
      .map((option) => String(option.value || "").trim())
      .filter(Boolean);
  }

  function render() {
    const totalLots = state.lots.length;
    const totalVehicles = Array.from(state.auctionsByEvent.values()).reduce((acc, list) => acc + list.length, 0);
    const totalInvitations = Array.from(state.invitationsByEvent.values()).reduce((acc, list) => acc + list.length, 0);

    root.innerHTML = `
      <div class="sd-card p-4">
        <div class="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-3">
          <div>
            <h4 class="mb-1">Lotes Judiciales</h4>
            <div class="sd-muted">Subastas por ofertas cerradas con múltiples empresas invitadas y una o más rondas.</div>
          </div>
          <span class="badge rounded-pill text-bg-dark">Módulo rediseñado</span>
        </div>

        <div class="row g-3 mb-4">
          <div class="col-12 col-md-4">
            <div class="border rounded-3 p-3 h-100">
              <div class="small text-muted">Lotes creados</div>
              <div class="h4 mb-0">${totalLots}</div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="border rounded-3 p-3 h-100">
              <div class="small text-muted">Vehículos asociados</div>
              <div class="h4 mb-0">${totalVehicles}</div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="border rounded-3 p-3 h-100">
              <div class="small text-muted">Invitaciones activas</div>
              <div class="h4 mb-0">${totalInvitations}</div>
            </div>
          </div>
        </div>

        <div class="row g-4">
          <div class="col-12">
            <div class="border rounded-3 p-3 h-100">
              <h5 class="mb-2">Crear Lote Judicial</h5>
              <div class="small text-muted mb-3">
                Crea el lote, invita empresas y carga la base de vehículos en Excel en un solo flujo.
              </div>

              <div id="lotCreateAlert"></div>

              <div class="row g-2 align-items-end">
                <div class="col-12 col-xl-3">
                  <label class="form-label">Nombre del lote</label>
                  <input id="lotCreateName" class="form-control" placeholder="Ej. Lote Junio 2026">
                </div>
                <div class="col-12 col-xl-3">
                  <label class="form-label">Empresas invitadas</label>
                  <select id="lotCreateCompanies" class="form-select" multiple size="1">
                    ${state.companies.map((company) => `<option value="${escapeHtml(company.id_company)}">${escapeHtml(company.company || company.id_company)}</option>`).join("")}
                  </select>
                </div>
                <div class="col-12 col-xl-3">
                  <label class="form-label">Inicio</label>
                  <input id="lotCreateStart" type="datetime-local" class="form-control">
                </div>
                <div class="col-12 col-xl-3">
                  <label class="form-label">Cierre</label>
                  <input id="lotCreateEnd" type="datetime-local" class="form-control">
                </div>
                <div class="col-12 col-xl-8">
                  <label class="form-label">Base de vehículos (Excel)</label>
                  <input id="lotCreateFile" type="file" class="form-control" accept=".xlsx,.xls">
                </div>
                <div class="col-12 col-xl-4">
                </div>
                <div class="col-12 judicial-lot-actions-row">
                  <div class="judicial-lot-actions d-flex gap-2 justify-content-xl-end flex-wrap">
                    <button
                      id="btnDownloadAssetTemplate"
                      class="btn btn-primary lot-btn lot-btn-template"
                      style="background:#1e40af;border-color:#1e40af;color:#fff;"
                    >Descargar plantilla</button>
                    <button
                      id="btnCreateLot"
                      class="btn btn-danger lot-btn lot-btn-create"
                      style="background:#f84300;border-color:#f84300;color:#fff;"
                    >Crear lote</button>
                    <button
                      id="btnRefreshLots"
                      class="btn btn-secondary lot-btn lot-btn-refresh"
                      style="background:#334155;border-color:#334155;color:#fff;"
                    >Refrescar</button>
                  </div>
                </div>
                <div class="col-12">
                  <div class="form-text">Empresas: selecciona una o más con Ctrl/Cmd + clic. Archivo requerido con columnas: placa, ciudad, direccion, Marca, Modelo, Año, valor adjudicación.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border rounded-3 p-3 mt-4">
          <h5 class="mb-3">Lotes existentes</h5>
          <div class="table-responsive">
            <table class="table table-sm align-middle sd-table mb-0">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Lote</th>
                  <th>Inicio</th>
                  <th>Cierre</th>
                  <th>Vehículos</th>
                  <th>Empresas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${state.lots.length
                  ? state.lots.map((lot) => {
                    const vehicles = (state.auctionsByEvent.get(String(lot.id_event)) || []).length;
                    const invites = (state.invitationsByEvent.get(String(lot.id_event)) || []).length;
                    return `
                      <tr>
                        <td>${escapeHtml(lot.id_event)}</td>
                        <td>
                          <div class="fw-semibold">${escapeHtml(lotName(lot))}</div>
                          <div class="small text-muted">${escapeHtml(lotDescription(lot))}</div>
                        </td>
                        <td>${escapeHtml(prettyDate(lot.start_at))}</td>
                        <td>${escapeHtml(prettyDate(lot.end_at))}</td>
                        <td>${escapeHtml(vehicles)}</td>
                        <td>${escapeHtml(invites)}</td>
                        <td><span class="badge text-bg-light border">${escapeHtml(statusBadge(lot))}</span></td>
                      </tr>
                    `;
                  }).join("")
                  : `
                    <tr>
                      <td colspan="7" class="text-center text-muted py-4">No hay lotes registrados.</td>
                    </tr>
                  `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function setCreateAlert(type, message) {
    const host = document.getElementById("lotCreateAlert");
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  async function loadData() {
    const [companiesRes, lotsRes, invitationsRes, auctionsRes] = await Promise.all([
      window.SD_API.request("/api/r_company?take=500"),
      window.SD_API.request("/api/r_event?includeInactive=true&take=500"),
      window.SD_API.request("/api/r_invitation?includeInactive=true&take=2000"),
      window.SD_API.request("/api/r_auction?includeInactive=true&take=2000"),
    ]);

    state.companies = Array.isArray(companiesRes?.data) ? companiesRes.data : [];
    state.lots = (Array.isArray(lotsRes?.data) ? lotsRes.data : []).filter((row) => {
      const additional = row?.additional && typeof row.additional === "object" ? row.additional : {};
      return String(additional.lot_type || "").toUpperCase() === "JUDICIAL_LOT";
    });

    const invitations = Array.isArray(invitationsRes?.data) ? invitationsRes.data : [];
    const auctions = Array.isArray(auctionsRes?.data) ? auctionsRes.data : [];

    state.invitationsByEvent = invitations.reduce((map, row) => {
      const key = String(row.id_event || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
      return map;
    }, new Map());

    state.auctionsByEvent = auctions.reduce((map, row) => {
      const key = String(row.id_event || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
      return map;
    }, new Map());
  }

  async function createLotFromForm() {
    if (state.creating) return;

    const name = String(document.getElementById("lotCreateName")?.value || "").trim();
    const startAt = dateInputToIso(document.getElementById("lotCreateStart")?.value || "");
    const endAt = dateInputToIso(document.getElementById("lotCreateEnd")?.value || "");
    const companyIds = getSelectedValues(document.getElementById("lotCreateCompanies"));
    const file = document.getElementById("lotCreateFile")?.files?.[0];

    if (!name) throw new Error("Debes ingresar el nombre del lote.");
    if (!startAt || !endAt) throw new Error("Debes ingresar fecha/hora de inicio y cierre.");
    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      throw new Error("La fecha de inicio debe ser menor a la fecha de cierre.");
    }
    if (!companyIds.length) throw new Error("Debes seleccionar al menos una compañía invitada.");
    if (!file) throw new Error("Debes cargar el archivo Excel con los vehículos.");

    state.creating = true;
    setCreateAlert("info", "Creando lote judicial...");

    try {
      const createdEventRes = await window.SD_API.request("/api/r_event", {
        method: "POST",
        body: {
          tp_event: "SEALED_BID",
          start_at: startAt,
          end_at: endAt,
          is_active: true,
          additional: {
            lot_name: name,
            lot_type: "JUDICIAL_LOT",
            lot_stage: "ROUND_1_OPEN",
          },
        },
      });

      const eventId = createdEventRes?.data?.id_event;
      if (!eventId) throw new Error("No se pudo crear el lote (evento). ");

      for (const companyId of companyIds) {
        try {
          await window.SD_API.request("/api/r_invitation", {
            method: "POST",
            body: {
              id_event: String(eventId),
              id_company: companyId,
              is_active: true,
            },
          });
        } catch (err) {
          if (Number(err?.status || 0) !== 409) throw err;
        }
      }

      const bulkPayload = new FormData();
      bulkPayload.append("file", file);
      bulkPayload.append("mode", "create");

      let bulkResult;
      try {
        bulkResult = await window.SD_API.request("/api/r_asset/bulk-upload", {
          method: "POST",
          body: bulkPayload,
        });
      } catch (err) {
        if (err && err.summary && Array.isArray(err.results)) {
          bulkResult = err;
        } else {
          throw err;
        }
      }

      const createdAssetIds = (Array.isArray(bulkResult?.results) ? bulkResult.results : [])
        .filter((row) => row.ok === true && row.id_asset)
        .map((row) => String(row.id_asset));

      for (const idAsset of createdAssetIds) {
        try {
          await window.SD_API.request("/api/r_auction", {
            method: "POST",
            body: {
              id_event: String(eventId),
              id_asset: idAsset,
              tp_auction: "SEALED_BID",
              is_active: true,
            },
          });
        } catch (err) {
          if (Number(err?.status || 0) !== 409) throw err;
        }
      }

      const failedRows = Number(bulkResult?.summary?.failed || 0);
      const successRows = Number(bulkResult?.summary?.success || createdAssetIds.length);

      setCreateAlert(
        failedRows > 0 ? "warning" : "success",
        `Lote creado correctamente. Vehículos cargados: ${successRows}. Errores de carga: ${failedRows}.`
      );

      await loadData();
      render();
      const alertHost = document.getElementById("lotCreateAlert");
      if (alertHost) {
        alertHost.innerHTML = `
          <div class="alert alert-${failedRows > 0 ? "warning" : "success"} py-2 mb-3">
            <div class="small">Lote creado correctamente. Vehículos cargados: ${successRows}. Errores de carga: ${failedRows}.</div>
          </div>
        `;
      }
    } finally {
      state.creating = false;
    }
  }

  async function downloadAssetTemplate() {
    const response = await fetch(`/api/r_asset/bulk-template?t=${Date.now()}`, {
      method: "GET",
      headers: window.SD_API.getAuthHeaders(),
    });

    if (!response.ok) {
      let errorPayload = null;
      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = null;
      }
      throw new Error(errorPayload?.error || errorPayload?.message || "No se pudo descargar la plantilla.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "r_asset_bulk_template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  root.addEventListener("click", (event) => {
    if (event.target.id === "btnRefreshLots") {
      loadData()
        .then(() => render())
        .catch((err) => {
          setCreateAlert("danger", err?.error || err?.message || "No se pudo refrescar la información.");
        });
      return;
    }

    if (event.target.id === "btnCreateLot") {
      createLotFromForm().catch((err) => {
        setCreateAlert("danger", err?.error || err?.message || "No se pudo crear el lote judicial.");
      });
    }

    if (event.target.id === "btnDownloadAssetTemplate") {
      setCreateAlert("info", "Descargando plantilla...");
      downloadAssetTemplate()
        .then(() => {
          setCreateAlert("success", "Plantilla descargada correctamente.");
        })
        .catch((err) => {
          setCreateAlert("danger", err?.message || "No se pudo descargar la plantilla.");
        });
    }
  });

  await loadData();
  render();
}
