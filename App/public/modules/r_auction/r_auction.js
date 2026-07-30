async function init_r_auction() {
  const root = document.getElementById("judicialLotsRoot") || document.getElementById("crudModuleRoot");
  if (!root) return;

  const state = {
    companies: [],
    lots: [],
    invitationsByEvent: new Map(),
    auctionsByEvent: new Map(),
    assetsById: new Map(),
    creating: false,
    editingEventId: null,
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

  function money(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    const additional = event?.additional && typeof event.additional === "object" ? event.additional : {};
    const lotStage = String(additional.lot_stage || "").toUpperCase();
    if (lotStage === "DELETED") return "Eliminado";
    if (lotStage === "CLOSED") return "Cerrado";

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

  function toDateInputValue(value) {
    if (!value) return "";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "";
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function setCreateButtonLabel() {
    const button = document.getElementById("btnCreateLot");
    if (!button) return;
    button.textContent = state.editingEventId ? "Guardar cambios" : "Crear lote";
  }

  function isActiveRecord(row) {
    return row?.is_active !== false;
  }

  function getEventAuctions(eventId) {
    return (state.auctionsByEvent.get(String(eventId)) || []).filter(isActiveRecord);
  }

  function getEventInvitations(eventId) {
    return (state.invitationsByEvent.get(String(eventId)) || []).filter(isActiveRecord);
  }

  function render() {
    const totalLots = state.lots.length;
    const totalVehicles = state.lots.reduce((acc, lot) => acc + getEventAuctions(lot.id_event).length, 0);
    const totalInvitations = state.lots.reduce((acc, lot) => acc + getEventInvitations(lot.id_event).length, 0);

    root.innerHTML = `
      <div class="sd-card p-4 lot-module-shell">
        <div class="lot-module-header d-flex align-items-start justify-content-between flex-wrap gap-3 mb-3">
          <div class="d-flex align-items-center gap-3">
            <div class="lot-header-icon">LJ</div>
            <div>
              <h4 class="mb-1">Lotes Judiciales</h4>
              <div class="sd-muted">Subastas por ofertas cerradas con múltiples empresas invitadas y una o más rondas.</div>
            </div>
          </div>
        </div>

        <div class="row g-3 mb-4">
          <div class="col-12 col-md-4">
            <div class="lot-kpi-card h-100">
              <div class="lot-kpi-icon lot-kpi-icon-lot">LT</div>
              <div>
                <div class="small text-muted">Lotes creados</div>
                <div class="h4 mb-0 lot-kpi-value lot-kpi-value-lot">${totalLots}</div>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="lot-kpi-card h-100">
              <div class="lot-kpi-icon lot-kpi-icon-vehicle">VH</div>
              <div>
                <div class="small text-muted">Vehículos asociados</div>
                <div class="h4 mb-0 lot-kpi-value lot-kpi-value-vehicle">${totalVehicles}</div>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="lot-kpi-card h-100">
              <div class="lot-kpi-icon lot-kpi-icon-invite">IV</div>
              <div>
                <div class="small text-muted">Invitaciones activas</div>
                <div class="h4 mb-0 lot-kpi-value lot-kpi-value-invite">${totalInvitations}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="row g-4">
          <div class="col-12">
            <div class="lot-create-card rounded-3 p-3 h-100">
              <h5 class="mb-2 d-flex align-items-center gap-2">
                <span class="lot-create-icon">+</span>
                <span>Crear Lote Judicial</span>
              </h5>
              <div class="small text-muted mb-3">
                Crea el lote, invita empresas y carga la base de vehículos en Excel en un solo flujo.
              </div>

              <div id="lotCreateAlert"></div>

              <div class="row g-2 align-items-start">
                <div class="col-12 col-xl-3">
                  <label class="form-label">Nombre del lote</label>
                  <input id="lotCreateName" class="form-control" placeholder="Ej. Lote Junio 2026">
                </div>
                <div class="col-12 col-xl-3">
                  <label class="form-label">Empresas invitadas</label>
                  <select id="lotCreateCompanies" class="form-select" multiple size="1">
                    ${state.companies.map((company) => `<option value="${escapeHtml(company.id_company)}">${escapeHtml(company.company || company.id_company)}</option>`).join("")}
                  </select>
                  <div class="small text-muted mt-1" id="lotSelectedCompaniesText">0 seleccionadas</div>
                </div>
                <div class="col-12 col-xl-3">
                  <label class="form-label">Inicio</label>
                  <input id="lotCreateStart" type="datetime-local" class="form-control">
                </div>
                <div class="col-12 col-xl-3">
                  <label class="form-label">Cierre</label>
                  <input id="lotCreateEnd" type="datetime-local" class="form-control">
                </div>

                <div class="col-12">
                  <label class="form-label">Base de vehículos (Excel)</label>
                  <div id="lotDropzone" class="lot-file-dropzone" role="button" tabindex="0" aria-label="Zona de carga de archivo Excel">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
                      <div>
                        <div class="fw-semibold">Arrastra y suelta tu archivo Excel aqui</div>
                        <div class="small text-muted">o selecciona un archivo desde tu equipo</div>
                      </div>
                      <button id="btnPickLotFile" type="button" class="btn btn-outline-primary">Elegir archivo</button>
                    </div>
                    <div id="lotFileText" class="small text-muted mt-2">Ningun archivo seleccionado.</div>
                  </div>
                  <input id="lotCreateFile" type="file" class="d-none" accept=".xlsx,.xls">
                </div>

                <div class="col-12 judicial-lot-actions-row">
                  <div class="judicial-lot-actions d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <button
                      id="btnDownloadAssetTemplate"
                      type="button"
                      class="lot-btn lot-btn-template"
                    >Descargar plantilla</button>
                    <button
                      id="btnCreateLot"
                      type="button"
                      class="lot-btn lot-btn-create"
                    >Crear lote</button>
                  </div>
                </div>
                <div class="col-12 mt-1">
                  <div class="form-text">Empresas: selecciona una o más con Ctrl/Cmd + clic. Archivo requerido con columnas: placa, ciudad, direccion, Marca, Modelo, Año, valor adjudicación.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="lot-table-card rounded-3 p-3 mt-4">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <h5 class="mb-0 d-flex align-items-center gap-2">
              <span class="lot-table-icon">TB</span>
              <span>Lotes existentes</span>
            </h5>
            <button id="btnRefreshLots" type="button" class="lot-icon-btn" aria-label="Refrescar lotes" title="Refrescar lotes">
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 3a5 5 0 1 0 4.546 2.916.75.75 0 1 1 1.364-.624A6.5 6.5 0 1 1 8 1.5v-1a.5.5 0 0 1 .854-.354l2 2a.5.5 0 0 1 0 .708l-2 2A.5.5 0 0 1 8 4.5z"/>
              </svg>
            </button>
          </div>
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
                  <th class="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${state.lots.length
                  ? state.lots.map((lot) => {
                    const vehicles = getEventAuctions(lot.id_event).length;
                    const invites = getEventInvitations(lot.id_event).length;
                    const lotAdditional = lot?.additional && typeof lot.additional === "object" ? lot.additional : {};
                    const lotStage = String(lotAdditional.lot_stage || "").toUpperCase();
                    const isClosedLot = lotStage === "CLOSED" || lot.is_active === false;
                    const relaunchButton = isClosedLot
                      ? `<button type="button" class="btn btn-sm btn-sd-outline" data-lot-action="relaunch" data-event-id="${escapeHtml(lot.id_event)}">Relanzar</button>`
                      : "";
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
                        <td class="text-center">
                          <div class="d-flex justify-content-center gap-1 flex-wrap">
                            <button type="button" class="btn btn-sm btn-sd-outline" data-lot-action="view" data-event-id="${escapeHtml(lot.id_event)}">Ver</button>
                            <button type="button" class="btn btn-sm btn-sd-outline" data-lot-action="edit" data-event-id="${escapeHtml(lot.id_event)}">Editar</button>
                            <button type="button" class="btn btn-sm btn-sd-outline" data-lot-action="close" data-event-id="${escapeHtml(lot.id_event)}" ${isClosedLot ? "disabled" : ""}>${isClosedLot ? "Cerrado" : "Cerrar"}</button>
                            ${relaunchButton}
                            <button type="button" class="btn btn-sm btn-sd-outline" data-lot-action="export" data-event-id="${escapeHtml(lot.id_event)}">Exportar</button>
                            <button type="button" class="btn btn-sm btn-sd" data-lot-action="delete" data-event-id="${escapeHtml(lot.id_event)}">Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")
                  : `
                    <tr>
                      <td colspan="8" class="text-center text-muted py-4">No hay lotes creados aun.</td>
                    </tr>
                  `}
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal fade" id="lotViewModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content sd-card">
              <div class="modal-header">
                <h5 class="modal-title" id="lotViewTitle">Detalle del lote</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <div id="lotViewMeta" class="sd-muted small mb-3"></div>
                <div class="table-responsive">
                  <table class="table table-sm align-middle sd-table mb-0">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ID Asset</th>
                        <th>Placa</th>
                        <th>Marca</th>
                        <th>Modelo</th>
                        <th>Año</th>
                        <th>Ciudad</th>
                        <th>Dirección</th>
                        <th>Quiénes ofertaron</th>
                        <th>Va ganando</th>
                      </tr>
                    </thead>
                    <tbody id="lotViewBody"></tbody>
                  </table>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-sd-outline" data-bs-dismiss="modal">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindFormEnhancements();
    setCreateButtonLabel();
  }

  function bindFormEnhancements() {
    const fileInput = document.getElementById("lotCreateFile");
    const dropzone = document.getElementById("lotDropzone");
    const fileText = document.getElementById("lotFileText");
    const companiesSelect = document.getElementById("lotCreateCompanies");
    const companiesText = document.getElementById("lotSelectedCompaniesText");

    const updateFileLabel = () => {
      if (!fileText) return;
      const file = fileInput?.files?.[0];
      fileText.textContent = file
        ? `Archivo seleccionado: ${file.name}`
        : "Ningun archivo seleccionado.";
    };

    const updateCompaniesLabel = () => {
      if (!companiesText) return;
      const count = getSelectedValues(companiesSelect).length;
      companiesText.textContent = `${count} seleccionada${count === 1 ? "" : "s"}`;
    };

    if (fileInput) {
      fileInput.addEventListener("change", updateFileLabel);
    }

    if (companiesSelect) {
      companiesSelect.addEventListener("change", updateCompaniesLabel);
    }

    if (dropzone && fileInput) {
      const preventDefaults = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      dropzone.addEventListener("click", () => fileInput.click());
      dropzone.addEventListener("dragenter", (event) => {
        preventDefaults(event);
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragover", (event) => {
        preventDefaults(event);
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", (event) => {
        preventDefaults(event);
        dropzone.classList.remove("is-dragover");
      });
      dropzone.addEventListener("drop", (event) => {
        preventDefaults(event);
        dropzone.classList.remove("is-dragover");

        const droppedFiles = event.dataTransfer?.files;
        if (!droppedFiles || droppedFiles.length === 0) return;

        const transfer = new DataTransfer();
        transfer.items.add(droppedFiles[0]);
        fileInput.files = transfer.files;
        updateFileLabel();
      });
    }

    updateFileLabel();
    updateCompaniesLabel();
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

  function focusCreateCard() {
    const card = root.querySelector(".lot-create-card");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearLotForm() {
    const nameInput = document.getElementById("lotCreateName");
    const startInput = document.getElementById("lotCreateStart");
    const endInput = document.getElementById("lotCreateEnd");
    const companiesSelect = document.getElementById("lotCreateCompanies");
    const fileInput = document.getElementById("lotCreateFile");

    if (nameInput) nameInput.value = "";
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    if (fileInput) fileInput.value = "";
    if (companiesSelect) {
      Array.from(companiesSelect.options).forEach((option) => {
        option.selected = false;
      });
      companiesSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    state.editingEventId = null;
    setCreateButtonLabel();
  }

  function fillFormFromLot(lot) {
    const additional = lot?.additional && typeof lot.additional === "object" ? lot.additional : {};
    const selectedCompanyIds = (state.invitationsByEvent.get(String(lot.id_event)) || [])
      .map((row) => String(row.id_company || ""))
      .filter(Boolean);

    const nameInput = document.getElementById("lotCreateName");
    const startInput = document.getElementById("lotCreateStart");
    const endInput = document.getElementById("lotCreateEnd");
    const companiesSelect = document.getElementById("lotCreateCompanies");

    if (nameInput) nameInput.value = String(additional.lot_name || lotName(lot) || "");
    if (startInput) startInput.value = toDateInputValue(lot.start_at);
    if (endInput) endInput.value = toDateInputValue(lot.end_at);

    if (companiesSelect) {
      Array.from(companiesSelect.options).forEach((option) => {
        option.selected = selectedCompanyIds.includes(String(option.value));
      });
      companiesSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    state.editingEventId = String(lot.id_event);
    setCreateButtonLabel();
    setCreateAlert("info", `Editando lote #${lot.id_event}. Ajusta campos y pulsa Guardar cambios.`);
  }

  function showLotSummary(lot) {
    const vehicles = getEventAuctions(lot.id_event).length;
    const invites = getEventInvitations(lot.id_event).length;
    setCreateAlert(
      "info",
      `Lote #${lot.id_event} · ${lotName(lot)} · Vehículos: ${vehicles} · Empresas: ${invites} · Estado: ${statusBadge(lot)}`
    );
    focusCreateCard();
  }

  async function openLotViewModal(lot) {
    const eventId = String(lot.id_event || "");
    const auctions = getEventAuctions(eventId);
    const invitations = getEventInvitations(eventId);

    const summaryByAuction = new Map();
    try {
      const summaryRes = await window.SD_API.request(`/api/r_auction/lot/${encodeURIComponent(eventId)}/bid-summary`);
      const rows = Array.isArray(summaryRes?.data) ? summaryRes.data : [];
      for (const row of rows) {
        summaryByAuction.set(String(row.id_auction || ""), row);
      }
    } catch {
      // Keep modal usable even if summary request fails.
    }

    const title = document.getElementById("lotViewTitle");
    const meta = document.getElementById("lotViewMeta");
    const body = document.getElementById("lotViewBody");

    if (title) {
      title.textContent = `Lote #${lot.id_event} · ${lotName(lot)}`;
    }

    if (meta) {
      meta.textContent = `Inicio: ${prettyDate(lot.start_at)} · Cierre: ${prettyDate(lot.end_at)} · Empresas invitadas: ${invitations.length} · Vehículos: ${auctions.length}`;
    }

    if (body) {
      if (!auctions.length) {
        body.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-3">No hay vehículos asociados a este lote.</td></tr>';
      } else {
        body.innerHTML = auctions.map((row, index) => {
          const asset = state.assetsById.get(String(row.id_asset || ""));
          const additional = asset?.additional && typeof asset.additional === "object" ? asset.additional : {};
          const bidSummary = summaryByAuction.get(String(row.id_auction || ""));

          const plate = additional.placa || additional.plate || "-";
          const brand = additional.marca || additional.brand || "-";
          const model = additional.modelo || additional.model || "-";
          const year = additional.anio || additional.year || "-";
          const city = additional.ciudad || additional.city || asset?.location_city || "-";
          const address = additional.direccion || additional.address || asset?.location_address || "-";

          const bidders = Array.isArray(bidSummary?.bidders) ? bidSummary.bidders : [];
          const biddersText = bidders.length
            ? bidders
              .map((bidder) => {
                const label = bidder?.name || bidder?.user || "Sin usuario";
                const company = bidder?.company_name ? ` (${bidder.company_name})` : "";
                return `${label}${company}`;
              })
              .join(", ")
            : "Sin ofertas";

          const leader = bidSummary?.leader || null;
          const leaderText = leader
            ? `${leader.name || leader.user || "Sin usuario"}${leader.company_name ? ` (${leader.company_name})` : ""} - $ ${money(leader.value)}`
            : "Sin ofertas";

          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(row.id_asset || "-")}</td>
              <td>${escapeHtml(plate)}</td>
              <td>${escapeHtml(brand)}</td>
              <td>${escapeHtml(model)}</td>
              <td>${escapeHtml(year)}</td>
              <td>${escapeHtml(city)}</td>
              <td>${escapeHtml(address)}</td>
              <td>${escapeHtml(biddersText)}</td>
              <td>${escapeHtml(leaderText)}</td>
            </tr>
          `;
        }).join("");
      }
    }

    const modalEl = document.getElementById("lotViewModal");
    if (modalEl) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  async function deactivateLot(lot) {
    const additional = lot?.additional && typeof lot.additional === "object" ? lot.additional : {};

    await window.SD_API.request(`/api/r_event/${lot.id_event}`, {
      method: "PUT",
      body: {
        is_active: false,
        additional: {
          ...additional,
          lot_stage: "DELETED",
          deleted_at: new Date().toISOString(),
        },
      },
    });
  }

  async function loadData() {
    const [companiesRes, lotsRes, invitationsRes, auctionsRes, assetsRes] = await Promise.all([
      window.SD_API.request("/api/r_company?take=500"),
      window.SD_API.request("/api/r_event?includeInactive=true&take=500"),
      window.SD_API.request("/api/r_invitation?includeInactive=true&take=2000"),
      window.SD_API.request("/api/r_auction?includeInactive=true&take=2000"),
      window.SD_API.request("/api/r_asset?includeInactive=true&take=5000"),
    ]);

    state.companies = Array.isArray(companiesRes?.data) ? companiesRes.data : [];
    state.lots = (Array.isArray(lotsRes?.data) ? lotsRes.data : []).filter((row) => {
      const additional = row?.additional && typeof row.additional === "object" ? row.additional : {};
      const lotType = String(additional.lot_type || "").toUpperCase();
      const lotStage = String(additional.lot_stage || "").toUpperCase();
      if (lotType !== "JUDICIAL_LOT") return false;
      if (lotStage === "DELETED") return false;
      if (row.is_active === true) return true;
      return lotStage === "CLOSED";
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

    const assets = Array.isArray(assetsRes?.data) ? assetsRes.data : [];
    state.assetsById = assets.reduce((map, row) => {
      map.set(String(row.id_asset || ""), row);
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
    if (!state.editingEventId && !file) throw new Error("Debes cargar el archivo Excel con los vehículos.");

    state.creating = true;
    setCreateAlert("info", "Creando lote judicial...");

    try {
      let eventId = state.editingEventId;
      if (eventId) {
        await window.SD_API.request(`/api/r_event/${eventId}`, {
          method: "PUT",
          body: {
            start_at: startAt,
            end_at: endAt,
            additional: {
              lot_name: name,
              lot_type: "JUDICIAL_LOT",
              lot_stage: "ROUND_1_OPEN",
            },
          },
        });
      } else {
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
        eventId = createdEventRes?.data?.id_event;
      }

      if (!eventId) throw new Error("No se pudo guardar el lote (evento).");

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

      let failedRows = 0;
      let successRows = 0;
      if (file) {
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

        failedRows = Number(bulkResult?.summary?.failed || 0);
        successRows = Number(bulkResult?.summary?.success || createdAssetIds.length);
      }

      setCreateAlert(
        failedRows > 0 ? "warning" : "success",
        `${state.editingEventId ? "Lote actualizado" : "Lote creado"} correctamente. Vehículos cargados: ${successRows}. Errores de carga: ${failedRows}.`
      );

      const operationLabel = state.editingEventId ? "Lote actualizado" : "Lote creado";
      await loadData();
      render();
      const alertHost = document.getElementById("lotCreateAlert");
      if (alertHost) {
        alertHost.innerHTML = `
          <div class="alert alert-${failedRows > 0 ? "warning" : "success"} py-2 mb-3">
            <div class="small">${operationLabel} correctamente. Vehículos cargados: ${successRows}. Errores de carga: ${failedRows}.</div>
          </div>
        `;
      }
      state.editingEventId = null;
      setCreateButtonLabel();
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

  async function closeLot(lot) {
    const eventId = String(lot?.id_event || "").trim();
    if (!eventId) throw new Error("Lote inválido");

    await window.SD_API.request(`/api/r_auction/lot/${encodeURIComponent(eventId)}/close`, {
      method: "POST",
    });
  }

  async function exportLot(lot) {
    const eventId = String(lot?.id_event || "").trim();
    if (!eventId) throw new Error("Lote inválido");

    const response = await fetch(`/api/r_auction/lot/${encodeURIComponent(eventId)}/export?t=${Date.now()}`, {
      method: "GET",
      headers: window.SD_API.getAuthHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      let errorPayload = null;
      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = null;
      }
      throw new Error(errorPayload?.error || errorPayload?.message || "No se pudo exportar el lote.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cierre_lote_${eventId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function relaunchLot(lot) {
    const eventId = String(lot?.id_event || "").trim();
    if (!eventId) throw new Error("Lote inválido");

    return window.SD_API.request(`/api/r_auction/lot/${encodeURIComponent(eventId)}/relaunch`, {
      method: "POST",
    });
  }

  root.addEventListener("click", (event) => {
    const refreshButton = event.target.closest("#btnRefreshLots");
    const createButton = event.target.closest("#btnCreateLot");
    const downloadButton = event.target.closest("#btnDownloadAssetTemplate");
    const pickFileButton = event.target.closest("#btnPickLotFile");
    const lotActionButton = event.target.closest("[data-lot-action]");

    if (lotActionButton) {
      const action = String(lotActionButton.getAttribute("data-lot-action") || "");
      const eventId = String(lotActionButton.getAttribute("data-event-id") || "");
      const lot = state.lots.find((row) => String(row.id_event) === eventId);
      if (!lot) return;

      if (action === "view") {
        openLotViewModal(lot);
        return;
      }

      if (action === "edit") {
        fillFormFromLot(lot);
        document.getElementById("lotCreateName")?.focus();
        focusCreateCard();
        return;
      }

      if (action === "delete") {
        const confirmed = window.confirm(`¿Deseas desactivar el lote #${lot.id_event}?`);
        if (!confirmed) return;

        deactivateLot(lot)
          .then(async () => {
            clearLotForm();
            await loadData();
            render();
            setCreateAlert("success", `Lote #${lot.id_event} desactivado correctamente. El registro permanece en base de datos.`);
            focusCreateCard();
          })
          .catch((err) => {
            setCreateAlert("danger", err?.error || err?.message || "No se pudo desactivar el lote.");
          });
        return;
      }

      if (action === "close") {
        const confirmed = window.confirm(`¿Deseas cerrar el lote #${lot.id_event}? Esta acción desactivará el evento.`);
        if (!confirmed) return;

        setCreateAlert("info", `Cerrando lote #${lot.id_event}...`);
        closeLot(lot)
          .then(async () => {
            await loadData();
            render();
            setCreateAlert("success", `Lote #${lot.id_event} cerrado correctamente.`);
          })
          .catch((err) => {
            setCreateAlert("danger", err?.message || "No se pudo cerrar el lote.");
          });
        return;
      }

      if (action === "relaunch") {
        const confirmed = window.confirm(`¿Deseas relanzar el lote #${lot.id_event}? Se creará un nuevo lote con los mismos vehículos y empresas invitadas.`);
        if (!confirmed) return;

        setCreateAlert("info", `Relanzando lote #${lot.id_event}...`);
        relaunchLot(lot)
          .then(async (result) => {
            await loadData();
            render();
            const newEventId = result?.data?.id_event ? `#${result.data.id_event}` : "nuevo";
            setCreateAlert("success", `Relanzamiento completado. Se creó el lote ${newEventId} a partir del lote #${lot.id_event}.`);
          })
          .catch((err) => {
            setCreateAlert("danger", err?.message || err?.error || "No se pudo relanzar el lote.");
          });
        return;
      }

      if (action === "export") {
        setCreateAlert("info", `Generando Excel del lote #${lot.id_event}...`);
        exportLot(lot)
          .then(() => {
            setCreateAlert("success", `Excel del lote #${lot.id_event} descargado correctamente.`);
          })
          .catch((err) => {
            setCreateAlert("danger", err?.message || "No se pudo exportar el lote.");
          });
        return;
      }
    }

    if (pickFileButton) {
      event.preventDefault();
      event.stopPropagation();
      const fileInput = document.getElementById("lotCreateFile");
      if (fileInput) fileInput.click();
      return;
    }

    if (refreshButton) {
      loadData()
        .then(() => render())
        .catch((err) => {
          setCreateAlert("danger", err?.error || err?.message || "No se pudo refrescar la información.");
        });
      return;
    }

    if (createButton) {
      createLotFromForm().catch((err) => {
        setCreateAlert("danger", err?.error || err?.message || "No se pudo crear el lote judicial.");
      });
    }

    if (downloadButton) {
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
