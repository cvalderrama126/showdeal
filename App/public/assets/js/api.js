/* public/assets/js/api.js */

(function (global) {
  const API_BASE = "";
  const SESSION_KEY = "showdeal_session";
  let csrfTokenCache = "";

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function getToken() {
    return getSession()?.token || "";
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session || null));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getAuthHeaders(headers = {}) {
    return { ...headers };
  }

  async function getCsrfToken() {
    if (csrfTokenCache) return csrfTokenCache;

    const res = await fetch(API_BASE + "/auth/csrf-token", {
      method: "GET",
      credentials: "include",
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.csrfToken) {
      throw { status: res.status, ...payload, error: payload?.error || "CSRF_TOKEN_UNAVAILABLE" };
    }

    csrfTokenCache = String(payload.csrfToken);
    return csrfTokenCache;
  }

  async function request(path, { method = "GET", body = null, headers = {} } = {}) {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const normalizedMethod = String(method || "GET").toUpperCase();
    const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod);
    const nextHeaders = getAuthHeaders(headers);

    if (!isFormData && body !== null) {
      const hasContentType = Object.keys(nextHeaders).some(
        (key) => key.toLowerCase() === "content-type"
      );
      if (!hasContentType) {
        nextHeaders["Content-Type"] = "application/json";
      }
    }

    if (needsCsrf && path !== "/auth/login" && path !== "/auth/otp/verify") {
      nextHeaders["X-CSRF-Token"] = await getCsrfToken();
    }

    const res = await fetch(API_BASE + path, {
      method: normalizedMethod,
      headers: nextHeaders,
      credentials: "include",
      body: body
        ? (isFormData ? body : JSON.stringify(body))
        : null,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { ok: false, error: "INVALID_JSON_RESPONSE", raw: text };
    }

    if (res.status === 401) {
      clearSession();
      throw { status: 401, ...data };
    }

    if (!res.ok || (data && data.ok === false)) {
      throw { status: res.status, ...data };
    }

    return data;
  }

  global.SD_API = {
    getSession,
    getToken,
    getAuthHeaders,
    setSession,
    clearSession,
    request,
  };
})(window);
