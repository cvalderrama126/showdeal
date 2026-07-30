async function init_r_buyer_offer() {
  const host = document.getElementById("buyerOfferRoot");
  if (!host) return;

  const state = {
    rows: [],
    selectedEventId: "",
    uploading: false,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function eventStatusBadge(status) {
    const code = String(status || "").toUpperCase();
    if (code === "VIGENTE") return { label: "Vigente", badge: "success" };
    if (code === "PROGRAMADO") return { label: "Programado", badge: "warning" };
    return { label: "Cerrado", badge: "secondary" };
  }

  host.innerHTML = `
    <div class="sd-card p-3 p-lg-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h4 class="mb-1">Vehículos para ofertar</h4>
          <div class="sd-muted">Encuentra los activos disponibles y realiza tu oferta.</div>
        </div>
        <button class="btn btn-sd-outline btn-sm" id="btnBuyerOfferRefresh">Actualizar</button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-12 col-lg-4">
          <label class="form-label">Lote judicial</label>
          <select class="form-select" id="buyerEventSelect">
            <option value="">Selecciona un lote...</option>
          </select>
        </div>
        <div class="col-12 col-lg-8 d-flex align-items-end gap-2 flex-wrap">
          <button class="btn btn-sd-outline btn-sm" id="btnBuyerTemplate">Descargar plantilla Excel</button>
          <input type="file" id="buyerExcelFile" class="form-control form-control-sm" style="max-width: 340px;" accept=".xlsx,.xls">
          <button class="btn btn-sd btn-sm" id="btnBuyerUploadExcel">Subir plantilla diligenciada</button>
          <span class="small text-muted" id="buyerExcelFileName"></span>
        </div>
      </div>
      <div id="buyerOfferAlert"></div>
      <div class="table-responsive">
        <table class="table table-sm align-middle sd-table">
          <thead>
            <tr>
              <th>ID Activo</th>
              <th>Placa</th>
              <th>Ciudad</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Año</th>
              <th>Tipo de activo</th>
              <th>Subasta</th>
              <th>Oferta actual</th>
              <th>Evento</th>
              <th>Estado</th>
              <th>Mi oferta</th>
              <th>Agregar oferta</th>
            </tr>
          </thead>
          <tbody id="buyerOfferRows"></tbody>
        </table>
      </div>
    </div>
  `;

  const rowsHost = document.getElementById("buyerOfferRows");
  const alertHost = document.getElementById("buyerOfferAlert");
  const eventSelect = document.getElementById("buyerEventSelect");
  const excelInput = document.getElementById("buyerExcelFile");
  const excelFileName = document.getElementById("buyerExcelFileName");
  function setAlert(type, message) {
    if (!alertHost) return;
    alertHost.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function getEventOptions(rows) {
    const map = new Map();
    for (const row of rows) {
      if (String(row.event_status || "").toUpperCase() !== "VIGENTE") continue;
      const idEvent = String(row.id_event || "").trim();
      if (!idEvent || map.has(idEvent)) continue;
      map.set(idEvent, {
        id: idEvent,
        status: String(row.event_status || "").toUpperCase(),
      });
    }
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
  }

  function renderEventOptions() {
    const events = getEventOptions(state.rows);
    if (!state.selectedEventId && events.length) {
      const liveEvent = events.find((event) => event.status === "VIGENTE");
      state.selectedEventId = liveEvent?.id || events[0].id;
    }

    eventSelect.innerHTML = `
      <option value="">Selecciona un lote...</option>
      ${events.map((event) => {
        const selected = state.selectedEventId === event.id ? "selected" : "";
        return `<option value="${escapeHtml(event.id)}" ${selected}>Lote #${escapeHtml(event.id)} (${escapeHtml(event.status)})</option>`;
      }).join("")}
    `;
  }

  function visibleRows() {
    const activeRows = state.rows.filter((row) => String(row.event_status || "").toUpperCase() === "VIGENTE");
    if (!state.selectedEventId) return activeRows;
    return activeRows.filter((row) => String(row.id_event || "") === state.selectedEventId);
  }

  async function loadRows() {
    if (rowsHost) rowsHost.innerHTML = "";
    setAlert("info", "Cargando activos para ofertar...");

    const response = await window.SD_API.request("/api/r_buyer_offer");
    state.rows = Array.isArray(response?.data) ? response.data : [];
    renderEventOptions();
    const displayRows = visibleRows();

    if (displayRows.length === 0) {
      setAlert("warning", "No hay vehículos con subasta disponible para el lote seleccionado.");
      return;
    }

    rowsHost.innerHTML = displayRows
      .map((row) => {
        const tpLabel = row.tp_auction === "SEALED_BID" ? "Sobre cerrado" : (row.tp_auction === "LIVE_AUCTION" ? "En vivo" : "-");
        const status = eventStatusBadge(row.event_status);
        const hint = row.can_bid ? "" : (row.already_bid && row.tp_auction === "SEALED_BID" ? "Sobre cerrado: ya ofertaste" : "No disponible para ofertar");
        const visibleCurrentOffer = row.tp_auction === "SEALED_BID"
          ? "No visible"
          : `$ ${escapeHtml(money(row.current_offer))}`;

        const isSealedBid = row.tp_auction === "SEALED_BID";
        const hasUserBid = row.already_bid === true || Number(row.my_offer || 0) > 0;
        const hasLockedBid = isSealedBid && hasUserBid;

        const offerControl = hasLockedBid
          ? `<span class="badge text-bg-secondary">Oferta registrada</span>`
          : `
              <input
                type="number"
                min="0"
                step="0.01"
                class="form-control form-control-sm"
                style="max-width:130px;"
                id="buyerBidInput_${escapeHtml(row.id_asset)}"
                value="${escapeHtml(Number(row.current_offer || 0).toFixed(2))}"
                ${row.can_bid ? "" : "disabled"}
              >
              <button
                class="btn btn-sm btn-sd"
                data-act="buyer-bid"
                data-auction-id="${escapeHtml(row.id_auction || "")}"
                data-asset-id="${escapeHtml(row.id_asset)}"
                ${row.can_bid ? "" : "disabled"}
              >Agregar oferta</button>
            `;

        const hintLabel = hasLockedBid
          ? ""
          : (hint ? `<span class="small text-muted">${escapeHtml(hint)}</span>` : "");

        return `
          <tr>
            <td>${escapeHtml(row.id_asset)}</td>
            <td>${escapeHtml(row.plate || "-")}</td>
            <td>${escapeHtml(row.city || "-")}</td>
            <td>${escapeHtml(row.brand || "-")}</td>
            <td>${escapeHtml(row.model || "-")}</td>
            <td>${escapeHtml(row.year || "-")}</td>
            <td>${escapeHtml(row.tp_asset || "")}</td>
            <td>${escapeHtml(tpLabel)}</td>
            <td>${visibleCurrentOffer}</td>
            <td>${row.id_event ? `#${escapeHtml(row.id_event)}` : "Sin evento"}</td>
            <td><span class="badge text-bg-${status.badge}">${escapeHtml(status.label)}</span></td>
            <td>${Number(row.my_offer || 0) > 0 ? `$ ${escapeHtml(money(row.my_offer))}` : "-"}</td>
            <td>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                ${offerControl}
                ${hintLabel}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    setAlert("success", `Se cargaron ${displayRows.length} vehículos para ofertar.`);
  }

  async function downloadTemplate() {
    const idEvent = String(state.selectedEventId || "").trim();
    if (!idEvent) {
      setAlert("warning", "Selecciona un lote antes de descargar la plantilla.");
      return;
    }

    setAlert("info", "Descargando plantilla de ofertas...");
    const response = await fetch(`/api/r_buyer_offer/round1/template?id_event=${encodeURIComponent(idEvent)}&t=${Date.now()}`, {
      method: "GET",
      headers: window.SD_API.getAuthHeaders(),
    });

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(payload?.error || payload?.message || "No se pudo descargar la plantilla.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plantilla_ofertas_evento_${idEvent}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setAlert("success", `Plantilla descargada para lote #${idEvent}.`);
  }

  async function uploadExcelOffers() {
    if (state.uploading) return;

    const idEvent = String(state.selectedEventId || "").trim();
    if (!idEvent) {
      setAlert("warning", "Selecciona un lote antes de cargar ofertas.");
      return;
    }

    const file = excelInput?.files?.[0];
    if (!file) {
      setAlert("warning", "Selecciona un archivo Excel con tus ofertas.");
      return;
    }

    state.uploading = true;
    setAlert("info", "Cargando ofertas del archivo...");

    try {
      const payload = new FormData();
      payload.append("id_event", idEvent);
      payload.append("file", file);

      const result = await window.SD_API.request("/api/r_buyer_offer/round1/upload", {
        method: "POST",
        body: payload,
      });

      const created = Number(result?.data?.summary?.created || 0);
      const failed = Number(result?.data?.summary?.failed || 0);
      setAlert(failed > 0 ? "warning" : "success", `Carga completada. Ofertas creadas: ${created}. Filas con error: ${failed}.`);

      if (excelInput) excelInput.value = "";
      if (excelFileName) excelFileName.textContent = "";
      await loadRows();
    } catch (err) {
      setAlert("danger", err?.error || err?.message || "No se pudo cargar el archivo de ofertas.");
    } finally {
      state.uploading = false;
    }
  }

  rowsHost?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act='buyer-bid']");
    if (!btn) return;

    const auctionId = String(btn.getAttribute("data-auction-id") || "").trim();
    const assetId = String(btn.getAttribute("data-asset-id") || "").trim();
    const input = document.getElementById(`buyerBidInput_${assetId}`);
    const amount = Number(String(input?.value || "").trim());

    if (!auctionId) {
      setAlert("warning", "No hay subasta disponible para este activo.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setAlert("warning", "Debes ingresar una oferta válida mayor a cero.");
      return;
    }

    btn.disabled = true;
    setAlert("info", "Registrando oferta...");

    try {
      await window.SD_API.request(`/api/r_auction/${encodeURIComponent(auctionId)}/bid`, {
        method: "POST",
        body: { value: amount },
      });
      setAlert("success", "Oferta registrada correctamente.");
      await loadRows();
    } catch (err) {
      const status = Number(err?.status || 0);
      if (status === 409 && err?.error === "SEALED_BID_ALREADY_SUBMITTED") {
        setAlert("warning", "En sobre cerrado solo puedes ofertar una única vez.");
        await loadRows();
        return;
      }
      if (status === 409 && err?.error === "EVENT_NOT_ACTIVE") {
        setAlert("warning", "El evento ya no está vigente para ofertar.");
        await loadRows();
        return;
      }
      setAlert("danger", err?.message || err?.error || "No se pudo registrar la oferta.");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("btnBuyerOfferRefresh")?.addEventListener("click", () => {
    loadRows().catch((err) => {
      setAlert("danger", err?.message || err?.error || "No se pudo actualizar la lista de vehículos.");
    });
  });

  eventSelect?.addEventListener("change", () => {
    state.selectedEventId = String(eventSelect.value || "").trim();
    loadRows().catch((err) => {
      setAlert("danger", err?.message || err?.error || "No se pudo filtrar por lote.");
    });
  });

  document.getElementById("btnBuyerTemplate")?.addEventListener("click", () => {
    downloadTemplate().catch((err) => {
      setAlert("danger", err?.message || err?.error || "No se pudo descargar la plantilla.");
    });
  });

  document.getElementById("btnBuyerUploadExcel")?.addEventListener("click", () => {
    if (state.uploading) return;
    uploadExcelOffers().catch((err) => {
      setAlert("danger", err?.message || err?.error || "No se pudo cargar el archivo de ofertas.");
    });
  });

  excelInput?.addEventListener("change", () => {
    const file = excelInput.files?.[0];
    if (excelFileName) {
      excelFileName.textContent = file ? `Archivo: ${file.name}` : "";
    }
  });

  await loadRows();
}
