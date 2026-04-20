(function () {
  const SESSION_KEY = "showdeal_session";

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

  function checkFirstLogin() {
    const params = new URLSearchParams(window.location.search);
    const firstLogin = params.get("first_login") === "1";
    if (!firstLogin) return;

    // Remove query param from URL
    window.history.replaceState({}, document.title, window.location.pathname);

    // Get OTP setup data from session
    const session = getSession();
    const otpSetup = session?.otpSetup;

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
        // Only show password change
        document.getElementById("otpSetupSection").style.display = "none";
        document.getElementById("passwordSection").style.display = "block";
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
        skipBtn.addEventListener("click", handleSkipOtp);
      }
    }, 300);
  }

  function showOtpSetupSection(otpSetup) {
    document.getElementById("otpSetupSection").style.display = "block";
    document.getElementById("passwordSection").style.display = "none";
    
    // Set secret value
    document.getElementById("otpSecret").value = otpSetup.secret;
    
    // Generate QR code image from otpauth_url
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpSetup.otpauth_url)}`;
    document.getElementById("otpQrCode").src = qrUrl;
    
    // Store data for validation
    window.currentOtpSetup = {
      secret: otpSetup.secret,
      otpauth_url: otpSetup.otpauth_url,
      userId: getSession()?.user?.id_user,
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
      const userId = window.currentOtpSetup?.userId;
      if (!userId) throw new Error("No se encontró ID de usuario");

      const resp = await fetch(`/auth/otp/enable/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });

      const data = await resp.json();

      if (!data.ok) {
        alert(data.error || "Código inválido");
        if (btn) btn.disabled = false;
        return;
      }

      // OTP validated, now change password
      showPasswordSection();
    } catch (err) {
      alert("Error: " + err.message);
      if (btn) btn.disabled = false;
    }
  }

  async function handleSkipOtp(ev) {
    ev.preventDefault();
    const confirmed = confirm("¿Omitir la configuración de OTP por ahora? Puedes hacerlo después desde el módulo de Usuarios.");
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
        headers: { "Content-Type": "application/json" },
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
})();
