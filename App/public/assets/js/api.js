/* public/assets/js/api.js */

(function (global) {
  const API_BASE = "";
  const SESSION_KEY = "showdeal_session";

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
    const nextHeaders = { ...headers };
    const token = getToken();
    if (token) nextHeaders.Authorization = `Bearer ${token}`;
    return nextHeaders;
  }

  async function request(path, { method = "GET", body = null, headers = {} } = {}) {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const nextHeaders = getAuthHeaders(headers);

    if (!isFormData && body !== null) {
      const hasContentType = Object.keys(nextHeaders).some(
        (key) => key.toLowerCase() === "content-type"
      );
      if (!hasContentType) {
        nextHeaders["Content-Type"] = "application/json";
      }
    }

    const res = await fetch(API_BASE + path, {
      method,
      headers: nextHeaders,
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
