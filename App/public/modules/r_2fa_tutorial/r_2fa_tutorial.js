async function init_r_2fa_tutorial() {
  function showAlert(type, message) {
    const host = document.getElementById("tutorial2faAlert");
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} py-2 mb-0">
        <div class="small">${message}</div>
      </div>
    `;
  }

  const supportScript = [
    "Guion rapido soporte 2FA:",
    "1) Validar usuario y canal autorizado.",
    "2) Confirmar hora automatica en celular.",
    "3) Reintentar con OTP vigente (6 digitos).",
    "4) Si falla, regenerar setup OTP desde Usuarios.",
    "5) Confirmar login exitoso y registrar cierre."
  ].join("\n");

  const btnPrint = document.getElementById("btn2faPrint");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      window.print();
    });
  }

  const btnCopy = document.getElementById("btn2faCopySupport");
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(supportScript);
        showAlert("success", "Guion de soporte copiado al portapapeles.");
      } catch {
        showAlert("warning", "No fue posible copiar automaticamente. Copialo manualmente desde la vista.");
      }
    });
  }
}
