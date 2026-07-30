(function () {
  const SESSION_KEY = "showdeal_session";
  const FIRST_LOGIN_OTP_SETUP_KEY = "showdeal_first_login_otp_setup";

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }

function safeText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function paintUser() {
  const s = getSession();
  const u = s?.user || {};

  safeText("uiUserName", u.name || u.user || "Usuario");
  safeText("uiUserLogin", u.user || u.login || u.email || "—");
  safeText("uiUserRole", u.role || u.roleName || (u.id_role ? `Rol #${u.id_role}` : "Usuario"));
}

  function bindLogout() {
    const btn = document.getElementById("logoutBtn"); // usa el mismo ID en todas
    if (!btn) return;

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.sdLogout) return window.sdLogout("/index.html");

      localStorage.removeItem(SESSION_KEY);
      window.location.replace("/index.html");
    });
  }

  async function checkFirstLogin() {
    const params = new URLSearchParams(window.location.search);
    const firstLogin = params.get("first_login") === "1";
    const otpSetupRequired = params.get("otp_setup") === "1";
    if (!firstLogin && !otpSetupRequired) return;

    window.firstLoginContext = {
      requirePasswordChange: firstLogin,
      otpSetupRequired,
    };

    // Remove query param from URL
    window.history.replaceState({}, document.title, window.location.pathname);

    // Get OTP setup data from session, or regenerate from backend if missing.
    let otpSetup = getFirstLoginOtpSetup();
    if (!otpSetup?.secret || !otpSetup?.otpauth_url) {
      otpSetup = await fetchFirstLoginOtpSetup().catch(() => null);
      if (otpSetup?.secret && otpSetup?.otpauth_url) {
        setFirstLoginOtpSetup(otpSetup);
      }
    }

    // Show modal
    setTimeout(() => {
      const modal = new bootstrap.Modal(document.getElementById("firstLoginModal"), {
        backdrop: "static",
        keyboard: false,
      });
      modal.show();

      // If OTP setup data available, show OTP section first
      if (otpSetup?.secret && otpSetup?.otpauth_url) {
        showOtpSetupSection(otpSetup);
      } else {
        if (window.firstLoginContext?.requirePasswordChange) {
          document.getElementById("otpSetupSection").style.display = "none";
          document.getElementById("passwordSection").style.display = "block";
        } else {
          document.getElementById("otpSetupSection").style.display = "none";
          document.getElementById("passwordSection").style.display = "none";
        }
      }

      // Bind form submits
      const passwordForm = document.getElementById("firstLoginForm");
      if (passwordForm) {
        passwordForm.addEventListener("submit", handlePasswordChange);
      }

      const otpForm = document.getElementById("otpValidationForm");
      if (otpForm) {
        otpForm.addEventListener("submit", handleOtpValidation);
      }

      const skipBtn = document.getElementById("skipOtpBtn");
      if (skipBtn) {
        skipBtn.disabled = window.firstLoginContext?.otpSetupRequired === true;
        skipBtn.style.display = window.firstLoginContext?.otpSetupRequired === true ? "none" : "inline-block";
        skipBtn.addEventListener("click", handleSkipOtp);
      }
    }, 300);
  }

  function showOtpSetupSection(otpSetup) {
    document.getElementById("otpSetupSection").style.display = "block";
    document.getElementById("passwordSection").style.display = "none";
    
    // Set secret value
    document.getElementById("otpSecret").value = otpSetup.secret;
    
    const qrImg = document.getElementById("otpQrCode");
    if (qrImg) {
      qrImg.src = "/auth/otp/qrcode";
    }
    
    // Store data for validation
    window.currentOtpSetup = {
      secret: otpSetup.secret,
      otpauth_url: otpSetup.otpauth_url,
    };
  }

  async function handleOtpValidation(ev) {
    ev.preventDefault();

    const code = document.getElementById("otpCode")?.value || "";
    
    if (!/^\d{6}$/.test(code)) {
      alert("Ingresa un código de 6 dígitos.");
      return;
    }

    const btn = ev.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const resp = await fetch("/auth/otp/enable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": await getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({ otp: code }),
      });

      const data = await resp.json();

      if (!data.ok) {
        alert(data.error || "Código inválido");
        if (btn) btn.disabled = false;
        return;
      }

      if (window.firstLoginContext?.requirePasswordChange === true) {
        showPasswordSection();
      } else {
        const modal = bootstrap.Modal.getInstance(document.getElementById("firstLoginModal"));
        if (modal) modal.hide();
        clearFirstLoginOtpSetup();
        alert("✅ OTP configurado correctamente. En el próximo inicio de sesión se solicitará tu código OTP.");
      }
    } catch (err) {
      alert("Error: " + err.message);
      if (btn) btn.disabled = false;
    }
  }

  async function handleSkipOtp(ev) {
    ev.preventDefault();
    const confirmed = confirm("¿Omitir la configuración de OTP por ahora? Podrás habilitarlo luego desde tu propia sesión.");
    if (!confirmed) return;

    // Go directly to password change
    showPasswordSection();
  }

  function showPasswordSection() {
    document.getElementById("otpSetupSection").style.display = "none";
    document.getElementById("passwordSection").style.display = "block";
    document.getElementById("newPassword").focus();
  }

  async function handlePasswordChange(ev) {
    ev.preventDefault();

    const password = document.getElementById("newPassword")?.value || "";
    const confirm = document.getElementById("confirmPassword")?.value || "";

    if (password !== confirm) {
      alert("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    const btn = ev.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const resp = await fetch("/auth/password/setup-first-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": await getCsrfToken(),
        },
        credentials: "include",
        body: JSON.stringify({ newPassword: password }),
      });

      const data = await resp.json();

      if (!data.ok) {
        alert(data.error || "Error al cambiar contraseña");
        if (btn) btn.disabled = false;
        return;
      }

      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById("firstLoginModal"));
      if (modal) modal.hide();

      clearFirstLoginOtpSetup();

      alert("✅ ¡Bienvenido a ShowDeal!\n\nTu cuenta está configurada correctamente.");
    } catch (err) {
      alert("Error: " + err.message);
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    paintUser();
    bindLogout();
    checkFirstLogin();
  });

  function getFirstLoginOtpSetup() {
    try {
      return JSON.parse(sessionStorage.getItem(FIRST_LOGIN_OTP_SETUP_KEY) || "null");
    } catch {
      return null;
    }
  }

  function clearFirstLoginOtpSetup() {
    sessionStorage.removeItem(FIRST_LOGIN_OTP_SETUP_KEY);
  }

  function setFirstLoginOtpSetup(payload) {
    try {
      sessionStorage.setItem(FIRST_LOGIN_OTP_SETUP_KEY, JSON.stringify(payload || null));
    } catch {
      // Ignore storage write errors in restricted browser contexts.
    }
  }

  async function fetchFirstLoginOtpSetup() {
    const response = await fetch("/auth/otp/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": await getCsrfToken(),
      },
      credentials: "include",
      body: "{}",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) return null;

    const data = payload || {};
    if (!data?.secret || !data?.otpauth_url) return null;

    return {
      secret: String(data.secret),
      otpauth_url: String(data.otpauth_url),
      issuer: data.issuer,
      label: data.label,
    };
  }

  async function getCsrfToken() {
    const response = await fetch("/auth/csrf-token", {
      method: "GET",
      credentials: "include",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.csrfToken) {
      throw new Error(payload?.error || "CSRF_TOKEN_UNAVAILABLE");
    }

    return String(payload.csrfToken);
  }
})();
