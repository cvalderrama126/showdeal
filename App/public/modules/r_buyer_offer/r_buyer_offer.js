async function init_r_buyer_offer() {
  const host = document.getElementById("buyerOfferRoot");
  if (!host) return;

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
      <div id="buyerOfferAlert"></div>
      <div class="table-responsive">
        <table class="table table-sm align-middle sd-table">
          <thead>
            <tr>
              <th>ID Activo</th>
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
  function setAlert(type, message) {
    if (!alertHost) return;
    alertHost.innerHTML = `
      <div class="alert alert-${type} py-2 mb-3">
        <div class="small">${escapeHtml(message)}</div>
      </div>
    `;
  }

  async function loadRows() {
    if (rowsHost) rowsHost.innerHTML = "";
    setAlert("info", "Cargando activos para ofertar...");

    const response = await window.SD_API.request("/api/r_buyer_offer");
    const displayRows = Array.isArray(response?.data) ? response.data : [];

    if (displayRows.length === 0) {
      setAlert("warning", "No hay vehículos con subasta disponible para tu perfil.");
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
        return `
          <tr>
            <td>${escapeHtml(row.id_asset)}</td>
            <td>${escapeHtml(row.tp_asset || "")}</td>
            <td>${escapeHtml(tpLabel)}</td>
            <td>${visibleCurrentOffer}</td>
            <td>${row.id_event ? `#${escapeHtml(row.id_event)}` : "Sin evento"}</td>
            <td><span class="badge text-bg-${status.badge}">${escapeHtml(status.label)}</span></td>
            <td>${Number(row.my_offer || 0) > 0 ? `$ ${escapeHtml(money(row.my_offer))}` : "-"}</td>
            <td>
              <div class="d-flex flex-wrap gap-2 align-items-center">
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
                ${hint ? `<span class="small text-muted">${escapeHtml(hint)}</span>` : ""}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    setAlert("success", `Se cargaron ${displayRows.length} vehículos para ofertar.`);
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

  await loadRows();
}
