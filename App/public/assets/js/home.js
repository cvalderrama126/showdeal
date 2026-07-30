// assets/js/home.js
(function () {
  const MODULES_BASE = "/modules";
  const DEFAULT_MODULE = "r_user";
  const GUIDE_SEEN_PREFIX = "showdeal_guide_seen_";
  let currentModuleName = null;

  const GUIDE_COPY = {
    introTitle: "Asistente del modulo",
    introDesc: "Te muestro los controles principales de esta pantalla. Puedes relanzar esta guia cuando quieras.",
    menuTitle: "Menu lateral",
    menuDesc: "Desde aqui cambias entre modulos segun tus permisos.",
    contentTitle: "Area principal",
    contentDesc: "Aqui se carga el modulo seleccionado.",
    actionTitle: "Acciones",
    actionDesc: "Estos botones ejecutan acciones clave como crear, refrescar, resolver o guardar.",
    filtersTitle: "Filtros",
    filtersDesc: "Usa estos campos para acotar resultados y trabajar mas rapido.",
    tableTitle: "Grilla",
    tableDesc: "Esta tabla muestra los registros y acciones por fila.",
    pagingTitle: "Paginacion",
    pagingDesc: "Usa estos controles para navegar entre paginas de resultados.",
  };

  const MODULE_SPECIFIC_GUIDES = {
    r_user: [
      {
        selector: "#btnNewUser",
        title: "Crear usuario",
        description: "Este boton abre el formulario para registrar un nuevo usuario.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#usersFilterSearch",
        title: "Busqueda rapida",
        description: "Filtra por usuario, nombre, documento o compania.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#usersFilterCompany",
        title: "Filtro por compania",
        description: "Acota la lista para ver solo usuarios de una compania.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#tblUsers",
        title: "Tabla de usuarios",
        description: "Aqui ves los registros y acciones disponibles por fila.",
        side: "top",
        align: "center",
      },
      {
        selector: "#btnUsersPrev",
        title: "Paginacion",
        description: "Navega entre paginas para revisar mas resultados.",
        side: "top",
        align: "start",
      },
    ],
    r_auction_resolution: [
      {
        selector: "#tabDashboardBtn",
        title: "Vista Dashboard",
        description: "Aqui se resumen metricas y graficos de resultados.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#tabGridBtn",
        title: "Vista Grilla",
        description: "En esta pestaña revisas detalle por subasta y acciones.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#btnToggleGridFilters",
        title: "Filtros avanzados",
        description: "Abre y cierra filtros para placa, fechas, usuario, empresa y estados.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#chartEventType",
        title: "Grafico principal",
        description: "Visualiza distribucion por tipo de evento del conjunto filtrado.",
        side: "top",
        align: "center",
      },
      {
        selector: "#auctionResolutionRows",
        title: "Resultados por subasta",
        description: "Desde aqui puedes abrir detalle y resolver subastas pendientes.",
        side: "top",
        align: "center",
      },
      {
        selector: "#btnAuctionGridPrev, #btnGridPrev",
        title: "Paginacion de grilla",
        description: "Avanza o retrocede por paginas de resultados.",
        side: "top",
        align: "start",
      },
    ],
    r_event: [
      {
        selector: "#crudBtnNew",
        title: "Crear evento",
        description: "Abre el formulario para registrar un nuevo evento de subasta.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "[data-filter-name='tp_event']",
        title: "Filtro por modalidad",
        description: "Filtra eventos por modalidad base (oferta unica o en vivo).",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#crudTableBody",
        title: "Tabla de eventos",
        description: "Aqui revisas eventos y sus acciones disponibles.",
        side: "top",
        align: "center",
      },
      {
        selector: "#crudTableBody [data-action='assets']",
        title: "Gestionar vehiculos",
        description: "Desde este boton asocias vehiculos al evento y defines modalidad por vehiculo.",
        side: "left",
        align: "center",
      },
      {
        selector: "#crudBtnPrev",
        title: "Paginacion",
        description: "Usa estos controles para navegar entre paginas de eventos.",
        side: "top",
        align: "start",
      },
    ],
    r_asset: [
      {
        selector: "#crudBtnNew",
        title: "Registrar vehiculo",
        description: "Abre el formulario para crear un nuevo vehiculo o activo.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#crudSearchInput",
        title: "Busqueda",
        description: "Busca por UIN, ciudad, direccion o tipo de vehiculo.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "[data-filter-name='status']",
        title: "Filtro por estado",
        description: "Acota resultados por estado operativo del vehiculo.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#crudTableBody",
        title: "Tabla de vehiculos",
        description: "Aqui ves los activos cargados y sus acciones por fila.",
        side: "top",
        align: "center",
      },
      {
        selector: "#crudTableBody [data-action='attachments']",
        title: "Adjuntos",
        description: "Gestiona documentos y archivos de soporte por activo.",
        side: "left",
        align: "center",
      },
      {
        selector: "#crudBtnPrev",
        title: "Paginacion",
        description: "Navega entre paginas del listado de vehiculos.",
        side: "top",
        align: "start",
      },
    ],
    r_auction: [
      {
        selector: "#crudBtnNew",
        title: "Crear subasta",
        description: "Abre el formulario para crear una nueva relacion evento-activo.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "[data-filter-name='tp_auction']",
        title: "Filtro por tipo",
        description: "Filtra subastas por tipo: sobre cerrado o en vivo.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "[data-filter-name='id_event']",
        title: "Filtro por evento",
        description: "Permite concentrarte en las subastas de un evento especifico.",
        side: "bottom",
        align: "start",
      },
      {
        selector: "#crudTableBody",
        title: "Tabla de subastas",
        description: "Revisa relaciones, estado y acciones disponibles.",
        side: "top",
        align: "center",
      },
      {
        selector: "#crudBtnPrev",
        title: "Paginacion",
        description: "Usa la paginacion para recorrer el historico de registros.",
        side: "top",
        align: "start",
      },
    ],
  };

  function getMenuItems() {
    return Array.from(document.querySelectorAll(".sd-menu-item[data-module]"));
  }

  function modulePermission(moduleName) {
    // Frontend-only module for buyers; backend authorization still applies per endpoint.
    if (moduleName === "r_buyer_offer" || moduleName === "r_buyer_won") {
      return { read: true, create: false, update: false, delete: false };
    }
    if (moduleName === "r_asset" && window.SD_USER?.isBuyer === true) {
      return { read: false, create: false, update: false, delete: false };
    }
    return window.SD_PERMISSIONS?.[moduleName] || { read: false, create: false, update: false, delete: false };
  }

  function setActive(moduleName) {
    document.querySelectorAll(".sd-menu-item").forEach((a) => a.classList.remove("active"));
    const el = document.querySelector(`.sd-menu-item[data-module="${moduleName}"]`);
    if (el) el.classList.add("active");
  }

  function getModuleLabel(moduleName) {
    const menu = document.querySelector(`.sd-menu-item[data-module="${moduleName}"] span:last-child`);
    return String(menu?.textContent || moduleName || "Modulo").trim();
  }

  function hasShepherdLib() {
    return Boolean(window.Shepherd?.Tour);
  }

  function ensureGuideFab() {
    if (document.getElementById("sdGuideFab")) return;

    const button = document.createElement("button");
    button.id = "sdGuideFab";
    button.type = "button";
    button.className = "sd-guide-fab";
    button.title = "Abrir guia del modulo";
    button.setAttribute("aria-label", "Abrir guia del modulo");
    button.textContent = "?";

    const hint = document.createElement("div");
    hint.id = "sdGuideHint";
    hint.className = "sd-guide-hint";
    hint.textContent = "Guia";

    button.addEventListener("click", () => {
      if (!currentModuleName) return;
      runGuidedTour(currentModuleName, { force: true });
    });

    document.body.appendChild(button);
    document.body.appendChild(hint);
  }

  function updateGuideFabLabel(moduleName) {
    const hint = document.getElementById("sdGuideHint");
    if (!hint) return;
    hint.textContent = `Guia: ${getModuleLabel(moduleName)}`;
  }

  function buildGuideSteps(moduleName) {
    const steps = [];
    const moduleLabel = getModuleLabel(moduleName);

    steps.push({
      element: document.querySelector("#appContent"),
      title: `${GUIDE_COPY.introTitle} - ${moduleLabel}`,
      description: GUIDE_COPY.introDesc,
      side: "top",
      align: "start",
    });

    if (document.querySelector(".sd-menu")) {
      steps.push({
        element: document.querySelector(".sd-menu"),
        title: GUIDE_COPY.menuTitle,
        description: GUIDE_COPY.menuDesc,
        side: "right",
        align: "start",
      });
    }

    const specificDefs = MODULE_SPECIFIC_GUIDES[moduleName] || [];
    const specificSteps = specificDefs
      .map((def) => ({
        element: document.querySelector(def.selector),
        title: def.title,
        description: def.description,
        side: def.side || "bottom",
        align: def.align || "start",
      }))
      .filter((step) => step.element instanceof Element);

    if (specificSteps.length > 0) {
      steps.push(...specificSteps);
      return steps;
    }

    const actionEl = document.querySelector("#appContent .btn-sd, #appContent .btn-sd-outline");
    if (actionEl) {
      steps.push({
        element: actionEl,
        title: GUIDE_COPY.actionTitle,
        description: GUIDE_COPY.actionDesc,
        side: "bottom",
        align: "start",
      });
    }

    const filtersEl = document.querySelector("#appContent input, #appContent select");
    if (filtersEl) {
      steps.push({
        element: filtersEl,
        title: GUIDE_COPY.filtersTitle,
        description: GUIDE_COPY.filtersDesc,
        side: "bottom",
        align: "start",
      });
    }

    const tableEl = document.querySelector("#appContent .sd-table, #appContent table");
    if (tableEl) {
      steps.push({
        element: tableEl,
        title: GUIDE_COPY.tableTitle,
        description: GUIDE_COPY.tableDesc,
        side: "top",
        align: "center",
      });
    }

    const paginationEl = document.querySelector("#appContent #btnUsersPrev, #appContent #btnGridPrev, #appContent [id*='Prev'], #appContent [id*='Next']");
    if (paginationEl) {
      steps.push({
        element: paginationEl,
        title: GUIDE_COPY.pagingTitle,
        description: GUIDE_COPY.pagingDesc,
        side: "top",
        align: "start",
      });
    }

    return steps.filter((step) => step.element instanceof Element);
  }

  function runGuidedTour(moduleName, { force = false } = {}) {
    if (!moduleName || !hasShepherdLib()) return;

    const storageKey = `${GUIDE_SEEN_PREFIX}${moduleName}`;
    const alreadySeen = localStorage.getItem(storageKey) === "1";
    if (!force && alreadySeen) return;

    const steps = buildGuideSteps(moduleName);
    if (!steps.length) return;

    const tour = new window.Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: "smooth", block: "center" },
      },
    });

    steps.forEach((step, index) => {
      const isFirst = index === 0;
      const isLast = index === steps.length - 1;

      const buttons = [];
      if (!isFirst) {
        buttons.push({ text: "Anterior", action: tour.back, classes: "shepherd-button-secondary" });
      }
      if (isLast) {
        buttons.push({ text: "Listo", action: tour.complete });
      } else {
        buttons.push({ text: "Siguiente", action: tour.next });
      }

      tour.addStep({
        id: `sd-guide-${moduleName}-${index}`,
        title: step.title,
        text: step.description,
        attachTo: {
          element: step.element,
          on: `${step.side || "bottom"}-${step.align || "start"}`,
        },
        buttons,
      });
    });

    const markSeen = () => localStorage.setItem(storageKey, "1");
    tour.on("complete", markSeen);
    tour.on("cancel", markSeen);

    tour.start();
  }

  function scheduleFirstVisitGuide(moduleName) {
    window.setTimeout(() => runGuidedTour(moduleName), 350);
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`No existe el archivo: ${url} (HTTP ${res.status})`);
    return await res.text();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderPlaceholder(moduleName, err) {
    const host = document.getElementById("appContent");
    const safeModuleName = escapeHtml(moduleName);
    const safeError = escapeHtml(String(err?.message || err));
    host.innerHTML = `
      <div class="sd-card p-4">
        <h4 class="mb-1">${safeModuleName}</h4>
        <div class="sd-muted mb-3">Este modulo todavia no tiene interfaz visual en el proyecto.</div>
        <div class="alert alert-warning mb-0">
          <div class="fw-bold mb-1">Frontend pendiente</div>
          <div class="small">${safeError}</div>
          <div class="small mt-2">El backend puede responder en <code>/api/${safeModuleName}</code>, pero aun no existe una pantalla dedicada.</div>
        </div>
      </div>
    `;
  }

  function renderNoAccess(moduleName) {
    const host = document.getElementById("appContent");
    const safeModuleName = escapeHtml(moduleName);
    host.innerHTML = `
      <div class="sd-card p-4">
        <h4 class="mb-1">${safeModuleName}</h4>
        <div class="alert alert-warning mb-0">
          <div class="fw-bold mb-1">Sin acceso</div>
          <div class="small">Tu usuario no tiene permisos de lectura para este módulo.</div>
        </div>
      </div>
    `;
  }

  function renderNoModules() {
    const host = document.getElementById("appContent");
    host.innerHTML = `
      <div class="sd-card p-4">
        <h4 class="mb-1">Sin módulos disponibles</h4>
        <div class="sd-muted">No hay opciones habilitadas para tu rol en este momento.</div>
      </div>
    `;
  }

  async function loadPermissions() {
    const modules = getMenuItems()
      .map((item) => item.getAttribute("data-module"))
      .filter(Boolean);

    if (!modules.length) return {};

    const response = await window.SD_API.request(`/auth/permissions?modules=${encodeURIComponent(modules.join(","))}`);
    window.SD_USER = {
      isAdmin: response?.isAdmin === true,
      isAuctioneer: response?.isAuctioneer === true,
      isBuyer: response?.isBuyer === true,
      roleName: response?.roleName || "",
    };
    return response?.data || {};
  }

  function applyMenuPermissions() {
    const readableModules = [];
    const allModules = [];
    const isAdmin = window.SD_USER?.isAdmin === true;
    const isAuctioneer = window.SD_USER?.isAuctioneer === true;
    const isBuyer = window.SD_USER?.isBuyer === true;
    const buyerAllowedModules = new Set(["r_buyer_offer", "r_buyer_won"]);
    const auctioneerBlockedModules = new Set(["r_module", "r_role", "r_access"]);

    getMenuItems().forEach((item) => {
      const moduleName = item.getAttribute("data-module");
      const permission = modulePermission(moduleName);
      const canRead = permission.read === true;
      const onlyAdmin = item.getAttribute("data-only-admin") === "1";
      const onlyBuyer = item.getAttribute("data-only-buyer") === "1";
      const buyerBlocked = window.SD_USER?.isBuyer === true && moduleName === "r_asset";
      const buyerRoleAllowed = !isBuyer || buyerAllowedModules.has(moduleName);
      const auctioneerBlocked = isAuctioneer && auctioneerBlockedModules.has(moduleName);
      const roleAllowed = (!onlyAdmin || isAdmin || isAuctioneer) && (!onlyBuyer || isBuyer) && !buyerBlocked && buyerRoleAllowed && !auctioneerBlocked;
      const visible = roleAllowed && canRead;

      item.hidden = visible === false;
      item.classList.remove("active");
      item.classList.toggle("opacity-50", false);
      item.setAttribute("data-can-read", canRead ? "1" : "0");
      if (visible) {
        allModules.push(moduleName);
        readableModules.push(moduleName);
      }
    });

    return { readableModules, allModules };
  }

  async function loadModule(moduleName) {
    if (modulePermission(moduleName).read !== true) {
      renderNoAccess(moduleName);
      currentModuleName = moduleName;
      updateGuideFabLabel(moduleName);
      return;
    }

    try {
      const htmlUrl = `${MODULES_BASE}/${moduleName}/${moduleName}.html`;
      const html = await fetchText(htmlUrl);
      document.getElementById("appContent").innerHTML = html;

      const jsUrl = `${MODULES_BASE}/${moduleName}/${moduleName}.js?v=${Date.now()}`;
      const jsId = `mod-js-${moduleName}`;
      const old = document.getElementById(jsId);
      if (old) old.remove();

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = jsId;
        script.src = jsUrl;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`No se pudo cargar JS: ${jsUrl}`));
        document.body.appendChild(script);
      });

      const initName = `init_${moduleName}`;
      if (typeof window[initName] !== "function") {
        throw new Error(`El modulo ${moduleName} no expone ${initName}()`);
      }

      await window[initName]();

      setActive(moduleName);
      currentModuleName = moduleName;
      updateGuideFabLabel(moduleName);
      scheduleFirstVisitGuide(moduleName);
    } catch (err) {
      renderPlaceholder(moduleName, err);
      setActive(moduleName);
      currentModuleName = moduleName;
      updateGuideFabLabel(moduleName);
      console.error(err);
    }
  }

  document.addEventListener("click", function (e) {
    const trigger = e.target.closest(".sd-menu-item[data-module]");
    if (!trigger) return;

    e.preventDefault();
    loadModule(trigger.getAttribute("data-module"));
  });

  document.addEventListener("DOMContentLoaded", function () {
    (async function bootstrapHome() {
      ensureGuideFab();

      try {
        window.SD_PERMISSIONS = await loadPermissions();
      } catch (err) {
        console.error("[ShowDeal] no se pudieron cargar permisos:", err);
        window.SD_PERMISSIONS = window.SD_PERMISSIONS || {};
      }

      const { readableModules, allModules } = applyMenuPermissions();
      const initialModule = readableModules.includes(DEFAULT_MODULE)
        ? DEFAULT_MODULE
        : (readableModules[0] || allModules[0]);

      if (!initialModule) {
        renderNoModules();
        return;
      }

      loadModule(initialModule);
    })();
  });

  window.SD_HOME = {
    loadModule,
    startGuide(moduleName) {
      if (!moduleName) return;
      runGuidedTour(moduleName, { force: true });
    },
    startCurrentGuide() {
      if (!currentModuleName) return;
      runGuidedTour(currentModuleName, { force: true });
    },
  };
})();
