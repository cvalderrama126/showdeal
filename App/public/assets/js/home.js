// assets/js/home.js
(function () {
  const MODULES_BASE = "/modules";
  const DEFAULT_MODULE = "r_user";
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getMenuItems() {
    return Array.from(document.querySelectorAll(".sd-menu-item[data-module]"));
  }

  function modulePermission(moduleName) {
    // Frontend-only module for buyers; backend authorization still applies per endpoint.
    if (moduleName === "r_buyer_offer") {
      return { read: true, create: false, update: false, delete: false };
    }
    return window.SD_PERMISSIONS?.[moduleName] || { read: true, create: true, update: true, delete: true };
  }

  function setActive(moduleName) {
    document.querySelectorAll(".sd-menu-item").forEach((a) => a.classList.remove("active"));
    const el = document.querySelector(`.sd-menu-item[data-module="${moduleName}"]`);
    if (el) el.classList.add("active");
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`No existe el archivo: ${url} (HTTP ${res.status})`);
    return await res.text();
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
    window.SD_USER = { isAdmin: response?.isAdmin === true };
    return response?.data || {};
  }

  function applyMenuPermissions() {
    const readableModules = [];
    const allModules = [];
    const isAdmin = window.SD_USER?.isAdmin === true;

    getMenuItems().forEach((item) => {
      const moduleName = item.getAttribute("data-module");
      const permission = modulePermission(moduleName);
      const canRead = permission.read === true;
      const onlyAdmin = item.getAttribute("data-only-admin") === "1";
      const onlyBuyer = item.getAttribute("data-only-buyer") === "1";
      const roleAllowed = (!onlyAdmin || isAdmin) && (!onlyBuyer || !isAdmin);

      item.hidden = roleAllowed === false;
      item.classList.remove("active");
      item.classList.toggle("opacity-50", !canRead && roleAllowed);
      item.setAttribute("data-can-read", canRead ? "1" : "0");
      if (roleAllowed) {
        allModules.push(moduleName);
        if (canRead) readableModules.push(moduleName);
      }
    });

    return { readableModules, allModules };
  }

  async function loadModule(moduleName) {
    if (modulePermission(moduleName).read !== true) {
      renderNoAccess(moduleName);
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
      if (typeof window[initName] === "function") {
        await window[initName]();
      }

      setActive(moduleName);
    } catch (err) {
      renderPlaceholder(moduleName, err);
      setActive(moduleName);
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

  window.SD_HOME = { loadModule };
})();
