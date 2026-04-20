(function () {
  const API_BASE = "";
  const SESSION_KEY = "showdeal_session";
  const CHALLENGE_KEY = "showdeal_challenge";

  function qs(id) { return document.getElementById(id); }

  function getSession() {
    if (window.SD_API?.getSession) return window.SD_API.getSession();
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }

  function saveSession(payload) {
    const session = {
      user: payload.user || null,
      firstLogin: payload.firstLogin === true,
      otpSetup: payload.otpSetup || null,
      createdAt: Date.now(),
    };

    if (window.SD_API?.setSession) {
      window.SD_API.setSession(session);
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    if (window.SD_API?.clearSession) {
      window.SD_API.clearSession();
      return;
    }

    localStorage.removeItem(SESSION_KEY);
  }

  function getChallenge() {
    try { return JSON.parse(sessionStorage.getItem(CHALLENGE_KEY) || "null"); }
    catch { return null; }
  }

  function setChallenge(data) {
    sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(data));
  }

  function clearChallenge() {
    sessionStorage.removeItem(CHALLENGE_KEY);
  }

  function showError(message) {
    window.alert(message || "Ocurrio un error procesando la solicitud.");
  }

  function redirectIfAuthenticated() {
    const session = getSession();
    if (!session?.user) return;

    const path = window.location.pathname;
    if (path === "/" || path.endsWith("/index.html") || path.endsWith("/otp.html")) {
      window.location.replace("/home.html");
    }
  }

  async function postJson(url, body) {
    const resp = await fetch(API_BASE + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });

    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  }

  async function handleLoginSubmit(ev) {
    ev.preventDefault();

    const form = ev.target;
    form.classList.add("was-validated");
    if (!form.checkValidity()) return;

    const user = (qs("user")?.value || "").trim();
    const password = qs("password")?.value || "";
    const btn = form.querySelector('button[type="submit"]');

    if (btn) btn.disabled = true;

    try {
      const response = await postJson("/auth/login", { user, password });

      if (!response.data || response.data.ok !== true) {
        if (response.data?.code === "PASSWORD_EXPIRED") {
          showError("Tu contrasena vencio. Debes actualizarla antes de continuar.");
          return;
        }

        showError(response.data?.error || "Login fallo");
        return;
      }

      if (response.data.requireOtp) {
        setChallenge({
          challengeToken: response.data.challengeToken,
          user: response.data.user || { user },
          firstLogin: response.data.firstLogin === true,
          createdAt: Date.now(),
        });
        window.location.href = "/otp.html";
        return;
      }

      if (response.data.ok) {
        saveSession(response.data);
        clearChallenge();
        window.location.href = "/home.html?first_login=" + (response.data.firstLogin === true ? "1" : "0");
        return;
      }

      showError("Respuesta inesperada del servidor.");
    } catch {
      showError("No se pudo conectar con el servidor.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleOtpSubmit(ev) {
    ev.preventDefault();

    const form = ev.target;
    form.classList.add("was-validated");
    if (!form.checkValidity()) return;

    const challenge = getChallenge();
    if (!challenge?.challengeToken) {
      showError("No hay una verificacion OTP pendiente. Vuelve a iniciar sesion.");
      window.location.href = "/index.html";
      return;
    }

    const otp = (qs("otp")?.value || "").trim();
    const btn = form.querySelector('button[type="submit"]');

    if (btn) btn.disabled = true;

    try {
      const response = await postJson("/auth/otp/verify", {
        challengeToken: challenge.challengeToken,
        otp,
      });

      if (!response.data || response.data.ok !== true) {
        showError(response.data?.error || "OTP invalido");
        return;
      }

      saveSession(response.data);
      clearChallenge();
      window.location.href = "/home.html?first_login=" + (response.data.firstLogin === true ? "1" : "0");
    } catch {
      showError("No se pudo validar el OTP.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.sdLogout = function (redirectTo = "/index.html") {
    fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => {
        clearSession();
        clearChallenge();
        window.location.replace(redirectTo);
      });
  };

  document.addEventListener("DOMContentLoaded", () => {
    redirectIfAuthenticated();

    const loginForm = qs("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);

    const otpForm = qs("otpForm");
    if (otpForm) otpForm.addEventListener("submit", handleOtpSubmit);

    const challenge = getChallenge();
    const label = qs("otpUserLabel");
    if (label) label.textContent = challenge?.user?.user || "usuario";
  });
})();
