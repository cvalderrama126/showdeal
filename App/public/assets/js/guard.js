console.log("[GUARD] loaded on:", location.pathname);

(function () {
  const LOGIN_URL = "/index.html";
  const SESSION_KEY = "showdeal_session";

  function setKickReason(reason, extra) {
    try {
      sessionStorage.setItem("sd_guard_kick_reason", reason);
      if (extra) sessionStorage.setItem("sd_guard_kick_extra", String(extra));
      sessionStorage.setItem("sd_guard_kick_time", new Date().toISOString());
    } catch {}
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function kick(reason, extra) {
    console.warn("[GUARD] KICK:", reason, extra || "");
    setKickReason(reason, extra);

    // ✅ cortar loop: borrar sesión SIEMPRE
    try { localStorage.removeItem(SESSION_KEY); } catch {}

    // redirigir
    window.location.replace(LOGIN_URL + "?kick=1");
  }

  function getSessionRaw() {
    return localStorage.getItem(SESSION_KEY);
  }

  function getSession() {
    try { return JSON.parse(getSessionRaw() || "null"); }
    catch (e) { return { __parseError: String(e), __raw: getSessionRaw() }; }
  }

  function decodeJwtPayload(token) {
    try {
      const parts = (token || "").split(".");
      if (parts.length !== 3) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(b64).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      );
      return JSON.parse(json);
    } catch (e) {
      return { __decodeError: String(e) };
    }
  }

  async function verifyWithBackend(token) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);

    try {
      const resp = await fetch("/auth/me", {
        headers: { Authorization: "Bearer " + token },
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

    console.log("[GUARD] raw session:", getSessionRaw());

    const s = getSession();
    if (!s) return kick("NO_SESSION");
    if (s.__parseError) return kick("SESSION_JSON_INVALID", s.__parseError);

    const token = s.token;
    if (!token) return kick("NO_TOKEN_IN_SESSION");

    const payload = decodeJwtPayload(token);
    console.log("[GUARD] jwt payload:", payload);

    // Si exp existe, lo validamos. Si no existe, igual seguimos a backend.
    if (payload?.exp) {
      const now = Math.floor(Date.now() / 1000);
      const delta = payload.exp - now;
      console.log("[GUARD] exp delta:", delta);
      if (delta <= 0) return kick("JWT_EXPIRED", "delta=" + delta);
    }

    const ok = await verifyWithBackend(token);
    if (!ok) return kick("BACKEND_REJECTED_TOKEN");

    console.log("[GUARD] ✅ OK");
  }

  document.addEventListener("DOMContentLoaded", guard);
})();