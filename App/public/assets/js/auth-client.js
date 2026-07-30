(function () {
  const API_BASE = "";
  const SESSION_KEY = "showdeal_session";
  const CHALLENGE_KEY = "showdeal_challenge";
  const FIRST_LOGIN_OTP_SETUP_KEY = "showdeal_first_login_otp_setup";

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
      createdAt: Date.now(),
    };

    if (payload.otpSetup) {
      sessionStorage.setItem(FIRST_LOGIN_OTP_SETUP_KEY, JSON.stringify(payload.otpSetup));
    } else {
      sessionStorage.removeItem(FIRST_LOGIN_OTP_SETUP_KEY);
    }

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

  function clearFirstLoginOtpSetup() {
    sessionStorage.removeItem(FIRST_LOGIN_OTP_SETUP_KEY);
  }

  function showError(message) {
    window.alert(message || "Ocurrio un error procesando la solicitud.");
  }

  function showInfo(message) {
    window.alert(message || "Operacion completada.");
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search || "");
    return params.get(name);
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
    const headers = { "Content-Type": "application/json" };
    if (window.SD_API?.request && ["/auth/logout"].includes(url) === false) {
      try {
        const csrf = await fetch("/auth/csrf-token", { credentials: "include" })
          .then((r) => r.json())
          .then((d) => d?.csrfToken || "")
          .catch(() => "");
        if (csrf) headers["X-CSRF-Token"] = csrf;
      } catch {
        // Ignore CSRF bootstrap errors for public auth endpoints.
      }
    }

    const resp = await fetch(API_BASE + url, {
      method: "POST",
      headers,
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
          const registeredEmail = String(response.data?.user?.email || "").trim();
          const qpEmail = encodeURIComponent(registeredEmail);
          window.location.href = `/reset-password.html?expired=1&email=${qpEmail}`;
          return;
        }

        if (response.data?.code === "ACCOUNT_LOCKED" || response.data?.error === "ACCOUNT_LOCKED") {
          showError("Tu cuenta está bloqueada temporalmente por intentos fallidos. Recupera tu contraseña o intenta más tarde.");
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

      if (response.data.requireOtp === false) {
        saveSession(response.data);
        clearChallenge();
        const firstLoginFlag = response.data.firstLogin === true ? "1" : "0";
        const otpSetupFlag = response.data.otpSetupRequired === true ? "1" : "0";
        window.location.href = `/home.html?first_login=${firstLoginFlag}&otp_setup=${otpSetupFlag}`;
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
      const firstLoginFlag = response.data.firstLogin === true ? "1" : "0";
      const otpSetupFlag = response.data.otpSetupRequired === true ? "1" : "0";
      window.location.href = `/home.html?first_login=${firstLoginFlag}&otp_setup=${otpSetupFlag}`;
    } catch {
      showError("No se pudo validar el OTP.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handlePasswordResetRequestSubmit(ev) {
    ev.preventDefault();
    const form = ev.target;
    form.classList.add("was-validated");
    if (!form.checkValidity()) return;

    const email = (qs("resetRequestEmail")?.value || "").trim();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const response = await postJson("/auth/password-reset/request", { email });
      if (!response.ok) {
        showError(response.data?.message || response.data?.error || "No se pudo procesar la solicitud de recuperación.");
        return;
      }

      if (response.data?.devResetUrl) {
        try {
          const url = new URL(response.data.devResetUrl);
          const token = url.searchParams.get("token");
          const resetTokenInput = qs("resetToken");
          if (token && resetTokenInput && !resetTokenInput.value) {
            resetTokenInput.value = token;
          }
        } catch {
          // Ignore invalid dev URL parsing.
        }
      }

      showInfo(response.data?.message || "Si el correo existe, se enviaron instrucciones de recuperación.");
      form.reset();
      form.classList.remove("was-validated");
    } catch {
      showError("No se pudo conectar con el servidor.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handlePasswordResetSubmit(ev) {
    ev.preventDefault();
    const form = ev.target;
    form.classList.add("was-validated");
    if (!form.checkValidity()) return;

    const token = (qs("resetToken")?.value || "").trim();
    const password = qs("resetPassword")?.value || "";
    const confirm = qs("resetPasswordConfirm")?.value || "";

    if (password !== confirm) {
      showError("La confirmación de contraseña no coincide.");
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const response = await postJson("/auth/password-reset/reset", { token, password });
      if (!response.ok) {
        if (response.data?.error === "PASSWORD_POLICY_VIOLATION" && Array.isArray(response.data?.details)) {
          showError(response.data.details.join("\n"));
          return;
        }
        showError(response.data?.error || "No se pudo restablecer la contraseña.");
        return;
      }

      showInfo(response.data?.message || "Contraseña actualizada correctamente.");
      window.location.replace("/index.html");
    } catch {
      showError("No se pudo conectar con el servidor.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.sdLogout = function (redirectTo = "/index.html") {
    fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null).finally(() => {
      clearSession();
      clearChallenge();
      clearFirstLoginOtpSetup();
      window.location.replace(redirectTo);
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    redirectIfAuthenticated();

    const loginForm = qs("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);

    const otpForm = qs("otpForm");
    if (otpForm) otpForm.addEventListener("submit", handleOtpSubmit);

    const requestResetForm = qs("passwordResetRequestForm");
    if (requestResetForm) requestResetForm.addEventListener("submit", handlePasswordResetRequestSubmit);

    const resetPasswordForm = qs("passwordResetForm");
    if (resetPasswordForm) resetPasswordForm.addEventListener("submit", handlePasswordResetSubmit);

    const resetTokenInput = qs("resetToken");
    if (resetTokenInput && !resetTokenInput.value) {
      const tokenFromUrl = getQueryParam("token");
      if (tokenFromUrl) resetTokenInput.value = tokenFromUrl;
    }

    const resetEmailInput = qs("resetRequestEmail");
    if (resetEmailInput) {
      const emailFromUrl = getQueryParam("email");
      if (emailFromUrl && !resetEmailInput.value) {
        resetEmailInput.value = emailFromUrl;
      }

      const expiredFlag = getQueryParam("expired");
      if (expiredFlag === "1") {
        showInfo("Tu contrasena vencio. Solicita el enlace y actualizala para continuar.");
      }
    }

    const challenge = getChallenge();
    const label = qs("otpUserLabel");
    if (label) label.textContent = challenge?.user?.user || "usuario";
  });
})();
