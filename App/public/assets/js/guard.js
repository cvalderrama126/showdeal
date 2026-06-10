console.log("[GUARD] loaded on:", location.pathname);

(function () {
  const LOGIN_URL = "/index.html";

  function setKickReason(reason, extra) {
    try {
      sessionStorage.setItem("sd_guard_kick_reason", reason);
      if (extra) sessionStorage.setItem("sd_guard_kick_extra", String(extra));
      sessionStorage.setItem("sd_guard_kick_time", new Date().toISOString());
    } catch {}
  }

  function clearSession() {
    if (window.SD_API?.clearSession) {
      window.SD_API.clearSession();
      return;
    }
    localStorage.removeItem("showdeal_session");
  }

  function kick(reason, extra) {
    console.warn("[GUARD] KICK:", reason, extra || "");
    setKickReason(reason, extra);

    // ✅ cortar loop: borrar sesión SIEMPRE
    try { clearSession(); } catch {}

    // redirigir
    window.location.replace(LOGIN_URL + "?kick=1");
  }

  async function verifyWithBackend() {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);

    try {
      const resp = await fetch("/auth/me", {
        credentials: "include",
        signal: controller.signal
      });

      const text = await resp.text().catch(() => "");
      console.log("[GUARD] /auth/me status:", resp.status);
      console.log("[GUARD] /auth/me body:", text);

      return resp.ok;
    } catch (e) {
      console.warn("[GUARD] fetch error:", e);
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  async function guard() {
    // Solo aplica si estás en home
    if (!location.pathname.endsWith("/home.html")) return;

    const ok = await verifyWithBackend();
    if (!ok) return kick("BACKEND_REJECTED_TOKEN");

    console.log("[GUARD] ✅ OK");
  }

  document.addEventListener("DOMContentLoaded", guard);
})();