async function init_r_auction_resolution() {
  const host = document.getElementById("auctionResolutionRoot");
  if (!host) return;

  let rowsCache = [];
  let filteredRowsCache = [];
  let detailsModal = null;
  const chartInstances = new Map();
  let apexLoadPromise = null;
  let currentPage = 1;
  const PAGE_SIZE = 8;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return "0.00";
    return amount.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-CO");
  }

  function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function eventStatusLabel(status) {
    const labels = {
      LIVE: "En curso",
      SCHEDULED: "Programado",
      FINISHED: "Finalizado",
      INACTIVE: "Inactivo",
      NO_EVENT: "Sin evento",
    };
    return labels[String(status || "").toUpperCase()] || "Sin evento";
  }

  function eventTypeLabel(type) {
    const labels = {
      SEALED_BID: "Oferta unica",
      LIVE_AUCTION: "Oferta en vivo",
    };
    const key = String(type || "").toUpperCase();
    return labels[key] || firstText(type, "Sin tipo");
  }

  function eventStatusBadge(status) {
    const map = {
      LIVE: "success",
      SCHEDULED: "info",
      FINISHED: "secondary",
      INACTIVE: "dark",
      NO_EVENT: "warning",
    };
    return map[String(status || "").toUpperCase()] || "secondary";
  }

  function toDateStamp(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function firstText(...values) {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) return text;
    }
    return "-";
  }

  function badgeClass(row) {
    if (row.resolved) return "success";
    if (Number(row.bid_count || 0) > 0) return "warning";
    return "secondary";
  }

  function getWinner(row) {
    return row?.resolution?.winner || row?.winner_preview || null;
  }

  function distribution(rows, getter, limit = 5) {
    const counts = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = firstText(getter(row), "Sin dato");
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([label, value]) => ({ label, value }));
  }

  function renderMiniChartFallback(hostId, items) {
    const chartHost = document.getElementById(hostId);
    if (!chartHost) return;

    const list = Array.isArray(items) ? items : [];
    const maxValue = Math.max(1, ...list.map((item) => Number(item.value || 0)));

    if (!list.length) {
      chartHost.innerHTML = '<div class="small text-muted">Sin datos</div>';
      return;
    }

    chartHost.innerHTML = list.map((item) => {
      const pct = Math.round((Number(item.value || 0) / maxValue) * 100);
      return `
        <div class="sd-mini-row">
          <div class="d-flex justify-content-between gap-2">
            <span class="small text-truncate">${escapeHtml(item.label)}</span>
            <span class="small fw-semibold">${escapeHtml(item.value)}</span>
          </div>
          <div class="sd-mini-track">
            <div class="sd-mini-fill" style="width:${pct}%;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function loadApexCharts() {
    if (window.ApexCharts) return Promise.resolve();
    if (apexLoadPromise) return apexLoadPromise;

    function loadScript(id, src) {
      return new Promise((resolve, reject) => {
        const existing = document.getElementById(id);
        if (existing) {
          if (window.ApexCharts) {
            resolve();
            return;
          }
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
        document.head.appendChild(script);
      });
    }

    apexLoadPromise = new Promise(async (resolve, reject) => {
      try {
        await loadScript("apexcharts-local", "/assets/vendor/apexcharts.min.js");
        resolve();
      } catch (_localErr) {
        try {
          await loadScript("apexcharts-cdn", "https://cdn.jsdelivr.net/npm/apexcharts");
          resolve();
        } catch (cdnErr) {
          reject(cdnErr);
        }
      }
    });

    return apexLoadPromise;
  }

  function destroyChart(hostId) {
    const chart = chartInstances.get(hostId);
    if (chart) {
      chart.destroy();
      chartInstances.delete(hostId);
    }
  }

  async function renderApexBars(hostId, items, options = {}) {
    const host = document.getElementById(hostId);
    if (!host) return;

    const seriesItems = Array.isArray(items) ? items : [];
    if (!seriesItems.length) {
      host.innerHTML = '<div class="small text-muted">Sin datos</div>';
      destroyChart(hostId);
      return;
    }

    const chartContainerId = `${hostId}-apex`;
    host.innerHTML = `<div id="${chartContainerId}"></div>`;
    destroyChart(hostId);

    const chart = new window.ApexCharts(document.getElementById(chartContainerId), {
      chart: {
        type: "bar",
        height: Number(options.height || 220),
        toolbar: { show: false },
        animations: { enabled: true, speed: 350 },
      },
      series: [{ data: seriesItems.map((item) => Number(item.value || 0)) }],
      xaxis: {
        categories: seriesItems.map((item) => String(item.label || "Sin dato")),
        labels: { style: { fontSize: "10px" } },
      },
      yaxis: {
        labels: { style: { fontSize: "10px" } },
      },
      plotOptions: {
        bar: {
          borderRadius: 4,
          horizontal: options.horizontal === true,
          columnWidth: "45%",
          distributed: true,
        },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { strokeDashArray: 3, padding: { left: 0, right: 0 } },
      tooltip: {
        y: {
          formatter: (value) => `${value}`,
        },
      },
      theme: { monochrome: { enabled: false } },
      colors: ["#2f6fdb", "#20a4f3", "#00b894", "#f6bd60", "#e76f51", "#8d99ae", "#3a86ff", "#8338ec"],
    });

    await chart.render();
    chartInstances.set(hostId, chart);
  }

  async function renderApexArea(hostId, items) {
    const host = document.getElementById(hostId);
    if (!host) return;

    const seriesItems = Array.isArray(items) ? items : [];
    if (!seriesItems.length) {
      host.innerHTML = '<div class="small text-muted">Sin datos</div>';
      destroyChart(hostId);
      return;
    }

    const chartContainerId = `${hostId}-apex`;
    host.innerHTML = `<div id="${chartContainerId}"></div>`;
    destroyChart(hostId);

    const chart = new window.ApexCharts(document.getElementById(chartContainerId), {
      chart: {
        type: "area",
        height: 220,
        toolbar: { show: false },
        animations: { enabled: true, speed: 350 },
      },
      series: [{ name: "Subastas", data: seriesItems.map((item) => Number(item.value || 0)) }],
      xaxis: {
        categories: seriesItems.map((item) => String(item.label || "Sin fecha")),
        labels: { style: { fontSize: "10px" } },
      },
      yaxis: {
        labels: { style: { fontSize: "10px" } },
      },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2 },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.3,
          opacityFrom: 0.6,
          opacityTo: 0.15,
          stops: [0, 90, 100],
        },
      },
      colors: ["#2f6fdb"],
      legend: { show: false },
      grid: { strokeDashArray: 3, padding: { left: 0, right: 0 } },
    });

    await chart.render();
    chartInstances.set(hostId, chart);
  }

  async function renderApexDonut(hostId, items) {
    const host = document.getElementById(hostId);
    if (!host) return;

    const seriesItems = Array.isArray(items) ? items : [];
    if (!seriesItems.length) {
      host.innerHTML = '<div class="small text-muted">Sin datos</div>';
      destroyChart(hostId);
      return;
    }

    const chartContainerId = `${hostId}-apex`;
    host.innerHTML = `<div id="${chartContainerId}"></div>`;
    destroyChart(hostId);

    const chart = new window.ApexCharts(document.getElementById(chartContainerId), {
      chart: {
        type: "donut",
        height: 220,
        toolbar: { show: false },
      },
      labels: seriesItems.map((item) => String(item.label || "Sin dato")),
      series: seriesItems.map((item) => Number(item.value || 0)),
      legend: {
        position: "bottom",
        fontSize: "11px",
      },
      dataLabels: {
        enabled: true,
        style: { fontSize: "10px" },
      },
      stroke: { width: 1 },
      colors: ["#2f6fdb", "#20a4f3", "#00b894", "#f6bd60", "#e76f51", "#8d99ae", "#3a86ff", "#8338ec"],
    });

    await chart.render();
    chartInstances.set(hostId, chart);
  }

  function computeStats(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const resolved = list.filter((row) => row.resolved).length;
    const pending = list.length - resolved;
    const totalBids = list.reduce((acc, row) => acc + Number(row.bid_count || 0), 0);
    const totalValue = list.reduce((acc, row) => acc + Number(row.highest_bid || 0), 0);

    return {
      totalAuctions: list.length,
      resolved,
      pending,
      totalBids,
      totalValue,
    };
  }

  function statusLabel(row) {
    if (row.resolved) return "Resuelta";
    if (Number(row.bid_count || 0) > 0) return "Pendiente de cierre";
    return "Sin ofertas";
  }

  function ensureDetailsModal() {
    if (document.getElementById("auctionResultDetailModal")) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="modal fade" id="auctionResultDetailModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content sd-card">
            <div class="modal-header">
              <h5 class="modal-title">Detalle de resultado</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div id="auctionResultDetailBody"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
  }

  host.innerHTML = `
    <div class="sd-card p-3 p-lg-4">
      <style>
        #auctionResolutionRoot .sd-mini-row { margin-bottom: 0.5rem; }
        #auctionResolutionRoot .sd-mini-track { background: #eef1f4; border-radius: 999px; height: 6px; overflow: hidden; }
        #auctionResolutionRoot .sd-mini-fill { background: #2f6fdb; height: 100%; border-radius: 999px; }
        #auctionResolutionRoot .sd-mini-card { border: 1px solid #e5e8ee; border-radius: 12px; padding: 0.85rem; min-height: 235px; }
        #auctionResolutionRoot .sd-mini-title { font-size: 12px; font-weight: 700; color: #5f6b7a; margin-bottom: 0.3rem; }
        #auctionResolutionRoot #tabGrid .sd-table th,
        #auctionResolutionRoot #tabGrid .sd-table td {
          font-size: 12px;
          padding: 0.35rem 0.45rem;
          vertical-align: middle;
        }
        #auctionResolutionRoot #tabGrid .sd-table .small {
          font-size: 11px;
          line-height: 1.15;
        }
        #auctionResolutionRoot #tabGrid .sd-table .btn.btn-sm {
          font-size: 11px;
          padding: 0.18rem 0.4rem;
          line-height: 1.2;
        }
        #auctionResolutionRoot #tabGrid .form-control-sm,
        #auctionResolutionRoot #tabGrid .form-select-sm,
        #auctionResolutionRoot #tabGrid .btn-sm {
          font-size: 12px;
          padding-top: 0.25rem;
          padding-bottom: 0.25rem;
        }
      </style>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h4 class="mb-1">Resultados de subastas</h4>
          <div class="sd-muted">Consulta el resultado de cada subasta de oferta unica y, si aun sigue pendiente, resuelvela con la regla de mayor oferta y desempate por primera oferta.</div>
        </div>
        <button class="btn btn-sd-outline btn-sm" id="btnAuctionResolutionRefresh">Refrescar</button>
      </div>
      <div id="auctionResolutionAlert"></div>

      <ul class="nav nav-tabs mb-3" id="auctionResultTabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="tabDashboardBtn" data-bs-toggle="tab" data-bs-target="#tabDashboard" type="button" role="tab" aria-controls="tabDashboard" aria-selected="true">
            Dashboard
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="tabGridBtn" data-bs-toggle="tab" data-bs-target="#tabGrid" type="button" role="tab" aria-controls="tabGrid" aria-selected="false">
            Grilla
          </button>
        </li>
      </ul>

      <div class="tab-content" id="auctionResultTabsContent">
        <div class="tab-pane fade show active" id="tabDashboard" role="tabpanel" aria-labelledby="tabDashboardBtn" tabindex="0">
          <div class="row g-3 mb-3" id="auctionResolutionStats">
            <div class="col-6 col-lg-3">
              <div class="border rounded-3 p-3 h-100">
                <div class="small text-muted">Subastas</div>
                <div class="h4 mb-0" id="statAuctions">0</div>
              </div>
            </div>
            <div class="col-6 col-lg-3">
              <div class="border rounded-3 p-3 h-100">
                <div class="small text-muted">Resueltas</div>
                <div class="h4 mb-0 text-success" id="statResolved">0</div>
              </div>
            </div>
            <div class="col-6 col-lg-3">
              <div class="border rounded-3 p-3 h-100">
                <div class="small text-muted">Pendientes</div>
                <div class="h4 mb-0 text-warning" id="statPending">0</div>
              </div>
            </div>
            <div class="col-6 col-lg-3">
              <div class="border rounded-3 p-3 h-100">
                <div class="small text-muted">Mayor valor acumulado</div>
                <div class="h4 mb-0" id="statTotalValue">$ 0.00</div>
              </div>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Tipo de evento</div>
                <div id="chartEventType"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Tipo de vehículo</div>
                <div id="chartAssetType"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Estado del evento</div>
                <div id="chartEventStatus"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Marca</div>
                <div id="chartBrand"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Modelo</div>
                <div id="chartModel"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Subastas por fecha</div>
                <div id="chartDate"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Estado de subasta</div>
                <div id="chartAuctionState"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Empresa ganadora</div>
                <div id="chartWinnerCompany"></div>
              </div>
            </div>
            <div class="col-12 col-lg-6 col-xl-4">
              <div class="sd-mini-card">
                <div class="sd-mini-title">Usuarios ganadores</div>
                <div id="chartWinnerUser"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="tab-pane fade" id="tabGrid" role="tabpanel" aria-labelledby="tabGridBtn" tabindex="0">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <button
              id="btnToggleGridFilters"
              class="btn btn-sd-outline btn-sm"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#auctionGridFiltersPanel"
              aria-expanded="false"
              aria-controls="auctionGridFiltersPanel"
            >
              Filtros
            </button>
          </div>

          <div class="collapse" id="auctionGridFiltersPanel">
            <div class="sd-card border p-3 mb-3">
              <div class="row g-2 align-items-end">
                <div class="col-sm-6 col-lg-3">
                  <label class="form-label small mb-1">Placa / UIN</label>
                  <input type="text" class="form-control form-control-sm" id="filterPlate" placeholder="Ej. SEALED-ASSET" />
                </div>
                <div class="col-sm-6 col-lg-2">
                  <label class="form-label small mb-1">Fecha desde</label>
                  <input type="date" class="form-control form-control-sm" id="filterDateFrom" />
                </div>
                <div class="col-sm-6 col-lg-2">
                  <label class="form-label small mb-1">Fecha hasta</label>
                  <input type="date" class="form-control form-control-sm" id="filterDateTo" />
                </div>
                <div class="col-sm-6 col-lg-2">
                  <label class="form-label small mb-1">Usuario</label>
                  <select class="form-select form-select-sm" id="filterUser"><option value="">Todos</option></select>
                </div>
                <div class="col-sm-6 col-lg-2">
                  <label class="form-label small mb-1">Empresa</label>
                  <select class="form-select form-select-sm" id="filterCompany"><option value="">Todas</option></select>
                </div>
                <div class="col-sm-6 col-lg-1 d-grid">
                  <button class="btn btn-sd-outline btn-sm" id="btnClearFilters">Limpiar</button>
                </div>
                <div class="col-sm-6 col-lg-3">
                  <label class="form-label small mb-1">Tipo de evento</label>
                  <select class="form-select form-select-sm" id="filterEventType"><option value="">Todos</option></select>
                </div>
                <div class="col-sm-6 col-lg-3">
                  <label class="form-label small mb-1">Estado del evento</label>
                  <select class="form-select form-select-sm" id="filterEventStatus">
                    <option value="">Todos</option>
                    <option value="LIVE">En curso</option>
                    <option value="SCHEDULED">Programado</option>
                    <option value="FINISHED">Finalizado</option>
                    <option value="INACTIVE">Inactivo</option>
                    <option value="NO_EVENT">Sin evento</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-sm align-middle sd-table">
              <thead>
                <tr>
                  <th>Vehículo subastado</th>
                  <th>Tipo de evento</th>
                  <th>Usuario ganador</th>
                  <th>Empresa ganadora</th>
                  <th>Valor ganador</th>
                  <th>Estado evento</th>
                  <th>Estado</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="auctionResolutionRows"></tbody>
            </table>
          </div>

          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2">
            <div class="small text-muted" id="auctionGridPaginationInfo">Sin resultados</div>
            <div class="d-flex gap-2">
              <button class="btn btn-sd-outline btn-sm" id="btnAuctionGridPrev">Anterior</button>
              <button class="btn btn-sd-outline btn-sm" id="btnAuctionGridNext">Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const rowsHost = document.getElementById("auctionResolutionRows");
  const alertHost = document.getElementById("auctionResolutionAlert");
  const statAuctions = document.getElementById("statAuctions");
  const statResolved = document.getElementById("statResolved");
  const statPending = document.getElementById("statPending");
  const statTotalValue = document.getElementById("statTotalValue");
  const filterPlate = document.getElementById("filterPlate");
  const filterDateFrom = document.getElementById("filterDateFrom");
  const filterDateTo = document.getElementById("filterDateTo");
  const filterUser = document.getElementById("filterUser");
  const filterCompany = document.getElementById("filterCompany");
  const filterEventType = document.getElementById("filterEventType");
  const filterEventStatus = document.getElementById("filterEventStatus");
  const btnClearFilters = document.getElementById("btnClearFilters");
  const btnToggleGridFilters = document.getElementById("btnToggleGridFilters");
  const paginationInfo = document.getElementById("auctionGridPaginationInfo");
  const btnGridPrev = document.getElementById("btnAuctionGridPrev");
  const btnGridNext = document.getElementById("btnAuctionGridNext");

  ensureDetailsModal();
  detailsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("auctionResultDetailModal"));

  function renderStats(rows) {
    const stats = computeStats(rows);
    if (statAuctions) statAuctions.textContent = String(stats.totalAuctions);
    if (statResolved) statResolved.textContent = String(stats.resolved);
    if (statPending) statPending.textContent = String(stats.pending);
    if (statTotalValue) statTotalValue.textContent = `$ ${money(stats.totalValue)}`;
  }

  function fillSelectOptions(selectEl, values, defaultLabel, labelGetter) {
    if (!selectEl) return;
    const options = ["<option value=''>" + escapeHtml(defaultLabel) + "</option>"];
    values.forEach((value) => {
      const label = typeof labelGetter === "function" ? labelGetter(value) : value;
      options.push(`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`);
    });
    selectEl.innerHTML = options.join("");
  }

  function renderFilterOptions(rows) {
    const users = [...new Set(rows.map((row) => firstText(getWinner(row)?.user, getWinner(row)?.name)).filter((item) => item !== "-"))].sort();
    const companies = [...new Set(rows.map((row) => firstText(getWinner(row)?.company_name, row.winner_company_name)).filter((item) => item !== "-"))].sort();
    const eventTypes = [...new Set(rows.map((row) => firstText(row.event_type)).filter((item) => item !== "-"))].sort();

    fillSelectOptions(filterUser, users, "Todos");
    fillSelectOptions(filterCompany, companies, "Todas");
    fillSelectOptions(filterEventType, eventTypes, "Todos", eventTypeLabel);
    updateFilterToggleLabel();
  }

  function updateFilterToggleLabel() {
    if (!btnToggleGridFilters) return;

    const activeCount = [
      normalizeText(filterPlate?.value),
      normalizeText(filterDateFrom?.value),
      normalizeText(filterDateTo?.value),
      normalizeText(filterUser?.value),
      normalizeText(filterCompany?.value),
      normalizeText(filterEventType?.value),
      normalizeText(filterEventStatus?.value),
    ].filter(Boolean).length;

    btnToggleGridFilters.textContent = activeCount > 0
      ? `Filtros (${activeCount})`
      : "Filtros";
  }

  function applyFilters(rows) {
    const plateFilter = normalizeText(filterPlate?.value);
    const fromStamp = toDateStamp(filterDateFrom?.value);
    const toStamp = toDateStamp(filterDateTo?.value);
    const userFilter = normalizeText(filterUser?.value);
    const companyFilter = normalizeText(filterCompany?.value);
    const eventTypeFilter = normalizeText(filterEventType?.value);
    const eventStatusFilter = normalizeText(filterEventStatus?.value);

    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const winner = getWinner(row);
      const plate = normalizeText(row.asset_uin);
      const winnerUser = normalizeText(firstText(winner?.user, winner?.name));
      const winnerCompany = normalizeText(firstText(winner?.company_name, row.winner_company_name));
      const eventType = normalizeText(row.event_type);
      const eventStatus = normalizeText(row.event_status);
      const eventDate = toDateStamp(row.event_start_at);

      if (plateFilter && !plate.includes(plateFilter)) return false;
      if (userFilter && winnerUser !== userFilter) return false;
      if (companyFilter && winnerCompany !== companyFilter) return false;
      if (eventTypeFilter && eventType !== eventTypeFilter) return false;
      if (eventStatusFilter && eventStatus !== eventStatusFilter) return false;
      if (fromStamp !== null && eventDate !== null && eventDate < fromStamp) return false;
      if (toStamp !== null && eventDate !== null && eventDate > toStamp) return false;
      if ((fromStamp !== null || toStamp !== null) && eventDate === null) return false;

      return true;
    });
  }

  async function renderCharts(rows) {
    const eventData = distribution(rows, (row) => eventTypeLabel(row.event_type));
    const assetData = distribution(rows, (row) => row.asset_type || "Sin tipo");
    const eventStatusData = distribution(rows, (row) => eventStatusLabel(row.event_status));
    const brandData = distribution(rows, (row) => row.asset_brand || "Sin marca");
    const modelData = distribution(rows, (row) => row.asset_model || "Sin modelo");
    const winnerCompanyData = distribution(rows, (row) => getWinner(row)?.company_name || row.winner_company_name || "Sin empresa");
    const winnerUserData = distribution(rows, (row) => getWinner(row)?.user || getWinner(row)?.name || "Sin ganador");
    const auctionStateData = distribution(rows, (row) => {
      if (row.resolved) return "Resuelta";
      if (Number(row.bid_count || 0) > 0) return "Pendiente cierre";
      return "Sin ofertas";
    });
    const dateData = distribution(
      rows,
      (row) => {
        const date = new Date(row.event_start_at || 0);
        if (Number.isNaN(date.getTime())) return "Sin fecha";
        return date.toISOString().slice(0, 10);
      },
      8
    );

    try {
      await loadApexCharts();
      await renderApexBars("chartEventType", eventData, { horizontal: true });
      await renderApexBars("chartAssetType", assetData, { horizontal: true });
      await renderApexDonut("chartEventStatus", eventStatusData);
      await renderApexBars("chartBrand", brandData, { horizontal: true });
      await renderApexBars("chartModel", modelData, { horizontal: true });
      await renderApexArea("chartDate", dateData);
      await renderApexDonut("chartAuctionState", auctionStateData);
      await renderApexBars("chartWinnerCompany", winnerCompanyData, { horizontal: true });
      await renderApexBars("chartWinnerUser", winnerUserData, { horizontal: true });
    } catch (_err) {
      renderMiniChartFallback("chartEventType", eventData);
      renderMiniChartFallback("chartAssetType", assetData);
      renderMiniChartFallback("chartEventStatus", eventStatusData);
      renderMiniChartFallback("chartBrand", brandData);
      renderMiniChartFallback("chartModel", modelData);
      renderMiniChartFallback("chartDate", dateData);
      renderMiniChartFallback("chartAuctionState", auctionStateData);
      renderMiniChartFallback("chartWinnerCompany", winnerCompanyData);
      renderMiniChartFallback("chartWinnerUser", winnerUserData);
    }
  }

  function renderDetail(row) {
    const detailHost = document.getElementById("auctionResultDetailBody");
    if (!detailHost) return;

    const winner = getWinner(row);
    const bids = Array.isArray(row.bids) ? row.bids : [];

    detailHost.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-md-4">
          <div class="border rounded-3 p-3 h-100">
            <div class="small text-muted">Vehículo</div>
            <div class="fw-semibold">${escapeHtml(row.asset_uin || "-")}</div>
            <div class="small text-muted mt-1">${escapeHtml(firstText(row.asset_brand, "Sin marca"))} · ${escapeHtml(firstText(row.asset_model, "Sin modelo"))}</div>
            <div class="small text-muted mt-1">Subasta #${escapeHtml(row.id_auction || "-")} · Evento #${escapeHtml(row.id_event || "-")}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="border rounded-3 p-3 h-100">
            <div class="small text-muted">Ganador</div>
            <div class="fw-semibold">${escapeHtml(winner?.user || winner?.name || "Sin ofertas")}</div>
            <div class="small text-muted mt-1">${escapeHtml(winner?.company_name || row.winner_company_name || "Sin empresa")}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="border rounded-3 p-3 h-100">
            <div class="small text-muted">Evento</div>
            <div class="fw-semibold">${escapeHtml(eventTypeLabel(row.event_type))}</div>
            <div class="small text-muted mt-1">${escapeHtml(eventStatusLabel(row.event_status))}</div>
            <div class="small text-muted mt-1">${escapeHtml(formatDate(row.event_start_at))} a ${escapeHtml(formatDate(row.event_end_at))}</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="border rounded-3 p-3 h-100">
            <div class="small text-muted">Resultado</div>
            <div class="fw-semibold">$ ${escapeHtml(money(winner?.value || row.highest_bid || 0))}</div>
            <div class="small text-muted mt-1">${escapeHtml(row.tie_breaker_rule || "-")}</div>
          </div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>#</th>
              <th>Usuario</th>
              <th>Empresa</th>
              <th>Valor</th>
              <th>Hora de oferta</th>
            </tr>
          </thead>
          <tbody>
            ${bids.length ? bids.map((bid, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(bid.user || bid.name || "-")}</td>
                <td>${escapeHtml(bid.company_name || "-")}</td>
                <td>$ ${escapeHtml(money(bid.value))}</td>
                <td>${escapeHtml(formatDate(bid.ins_at))}</td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="5" class="text-center text-muted py-4">No hay ofertas registradas para esta subasta.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  function setAlert(type, message) {
    if (!alertHost) return;
    alertHost.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function clearAlert() {
    if (!alertHost) return;
    alertHost.innerHTML = "";
  }

  function paginateRows(rows) {
    const total = Array.isArray(rows) ? rows.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageRows = (Array.isArray(rows) ? rows : []).slice(start, end);

    return {
      pageRows,
      total,
      totalPages,
      from: total ? start + 1 : 0,
      to: total ? Math.min(end, total) : 0,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages,
    };
  }

  function renderPagination(meta) {
    if (paginationInfo) {
      paginationInfo.textContent = meta.total
        ? `Mostrando ${meta.from}-${meta.to} de ${meta.total} registros`
        : "Sin resultados";
    }
    if (btnGridPrev) btnGridPrev.disabled = !meta.hasPrev;
    if (btnGridNext) btnGridNext.disabled = !meta.hasNext;
  }

  function renderGrid(rows) {
    const list = Array.isArray(rows) ? rows : [];
    filteredRowsCache = list;
    const pageMeta = paginateRows(list);

    renderStats(list);
    void renderCharts(list);
    renderPagination(pageMeta);

    if (!list.length) {
      rowsHost.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">No hay resultados con los filtros seleccionados.</td>
        </tr>
      `;
      setAlert("warning", "No se encontraron resultados con los filtros actuales.");
      return;
    }

    rowsHost.innerHTML = pageMeta.pageRows.map((row) => `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(row.asset_uin || "-")}</div>
          <div class="small text-muted">${escapeHtml(firstText(row.asset_brand, "Sin marca"))} · ${escapeHtml(firstText(row.asset_model, "Sin modelo"))}</div>
          <div class="small text-muted">Subasta #${escapeHtml(row.id_auction)} · Evento #${escapeHtml(row.id_event || "-")}</div>
        </td>
        <td>
          <div class="fw-semibold">${escapeHtml(eventTypeLabel(row.event_type))}</div>
          <div class="small text-muted">${escapeHtml(formatDate(row.event_start_at))}</div>
        </td>
        <td>
          <div class="fw-semibold">${escapeHtml(getWinner(row)?.user || getWinner(row)?.name || "Sin ofertas")}</div>
          <div class="small text-muted">${escapeHtml(Number(row.tie_count || 0) > 1 ? "Empate resuelto por tiempo" : "Mayor oferta")}</div>
        </td>
        <td>${escapeHtml(getWinner(row)?.company_name || row.winner_company_name || "-")}</td>
        <td>$ ${escapeHtml(money(getWinner(row)?.value || row.highest_bid || 0))}</td>
        <td><span class="badge text-bg-${eventStatusBadge(row.event_status)}">${escapeHtml(eventStatusLabel(row.event_status))}</span></td>
        <td>
          <span class="badge text-bg-${badgeClass(row)}">${row.resolved ? "Resuelta" : "Pendiente"}</span>
          <div class="small text-muted mt-1">${escapeHtml(statusLabel(row))}</div>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-sd-outline me-1" data-act="show-detail" data-auction-id="${escapeHtml(row.id_auction)}">Detalle</button>
          <button class="btn btn-sm btn-sd" data-act="resolve-auction" data-auction-id="${escapeHtml(row.id_auction)}" ${row.resolved ? "disabled" : ""}>${row.resolved ? "Resuelta" : "Resolver"}</button>
        </td>
      </tr>
    `).join("");

    clearAlert();
  }

  function applyAndRender() {
    currentPage = 1;
    updateFilterToggleLabel();
    const filtered = applyFilters(rowsCache);
    renderGrid(filtered);
  }

  async function loadRows() {
    setAlert("info", "Cargando resultados de subastas...");
    const response = await window.SD_API.request("/api/r_auction_resolution");
    const rows = Array.isArray(response?.data) ? response.data : [];
    rowsCache = rows;

    renderFilterOptions(rows);
    applyAndRender();

    if (!rows.length) {
      setAlert("warning", "No se encontraron subastas de oferta unica para mostrar.");
    }
  }

  rowsHost?.addEventListener("click", async (event) => {
    const detailButton = event.target.closest("button[data-act='show-detail']");
    if (detailButton) {
      const auctionId = String(detailButton.getAttribute("data-auction-id") || "").trim();
      const row = filteredRowsCache.find((item) => String(item.id_auction) === auctionId)
        || rowsCache.find((item) => String(item.id_auction) === auctionId);
      if (row) {
        renderDetail(row);
        detailsModal?.show();
      }
      return;
    }

    const button = event.target.closest("button[data-act='resolve-auction']");
    if (!button) return;

    const auctionId = String(button.getAttribute("data-auction-id") || "").trim();
    if (!auctionId) return;

    const confirmed = confirm("Se adjudicará la subasta aplicando la regla de mayor oferta y, en empate, primera oferta registrada. ¿Continuar?");
    if (!confirmed) return;

    button.disabled = true;
    setAlert("info", `Resolviendo subasta #${auctionId}...`);

    try {
      const result = await window.SD_API.request(`/api/r_auction_resolution/${encodeURIComponent(auctionId)}/resolve`, {
        method: "POST",
      });
      const winner = result?.data?.resolution?.winner || result?.data?.winner_preview;
      setAlert(
        "success",
        `Subasta #${auctionId} adjudicada a ${winner?.user || winner?.name || "-"} por $ ${money(winner?.value)}.`
      );
      await loadRows();
    } catch (err) {
      setAlert("danger", err?.message || err?.error || "No se pudo resolver la subasta.");
      button.disabled = false;
    }
  });

  [filterPlate, filterDateFrom, filterDateTo, filterUser, filterCompany, filterEventType, filterEventStatus]
    .forEach((control) => {
      control?.addEventListener("input", applyAndRender);
      control?.addEventListener("change", applyAndRender);
    });

  btnClearFilters?.addEventListener("click", () => {
    if (filterPlate) filterPlate.value = "";
    if (filterDateFrom) filterDateFrom.value = "";
    if (filterDateTo) filterDateTo.value = "";
    if (filterUser) filterUser.value = "";
    if (filterCompany) filterCompany.value = "";
    if (filterEventType) filterEventType.value = "";
    if (filterEventStatus) filterEventStatus.value = "";
    updateFilterToggleLabel();
    applyAndRender();
  });

  btnGridPrev?.addEventListener("click", () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderGrid(filteredRowsCache);
  });

  btnGridNext?.addEventListener("click", () => {
    currentPage += 1;
    renderGrid(filteredRowsCache);
  });

  document.getElementById("btnAuctionResolutionRefresh")?.addEventListener("click", () => {
    loadRows().catch((err) => {
      setAlert("danger", err?.message || err?.error || "No se pudo actualizar el reporte.");
    });
  });

  await loadRows();
}