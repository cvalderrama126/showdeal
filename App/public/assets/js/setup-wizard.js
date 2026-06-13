(function () {
  const form = document.getElementById('wizardForm');
  const statusBox = document.getElementById('statusBox');
  const stepBadge = document.getElementById('stepBadge');
  const progressBar = document.getElementById('progressBar');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnFinish = document.getElementById('btnFinish');
  const panes = Array.from(document.querySelectorAll('.step-pane[data-step]'));

  let step = 1;
  const maxStep = panes.length;

  function setStatus(message, type) {
    statusBox.className = `alert alert-${type || 'info'}`;
    statusBox.textContent = message;
  }

  function showStep(nextStep) {
    step = Math.max(1, Math.min(maxStep, nextStep));
    panes.forEach((pane) => {
      pane.classList.toggle('active', Number(pane.dataset.step) === step);
    });
    stepBadge.textContent = String(step);
    progressBar.style.width = `${(step / maxStep) * 100}%`;

    btnPrev.disabled = step === 1;
    const isLast = step === maxStep;
    btnNext.classList.toggle('d-none', isLast);
    btnFinish.classList.toggle('d-none', !isLast);
  }

  function validateStep() {
    const dbHost = document.getElementById('dbHost');
    const dbPort = document.getElementById('dbPort');
    const installerUser = document.getElementById('installerUser');
    const installerPassword = document.getElementById('installerPassword');
    const dbName = document.getElementById('dbName');
    const appDbUser = document.getElementById('appDbUser');
    const appDbPassword = document.getElementById('appDbPassword');
    const companyName = document.getElementById('companyName');
    const adminName = document.getElementById('adminName');
    const adminUser = document.getElementById('adminUser');
    const adminPassword = document.getElementById('adminPassword');
    const adminPassword2 = document.getElementById('adminPassword2');

    if (step === 1) {
      const okHost = dbHost.value.trim().length >= 1;
      const okPort = /^\d+$/.test(dbPort.value.trim()) && Number(dbPort.value.trim()) > 0;
      const okUser = installerUser.value.trim().length >= 1;
      const okPass = installerPassword.value.length >= 1;
      dbHost.classList.toggle('is-invalid', !okHost);
      dbPort.classList.toggle('is-invalid', !okPort);
      installerUser.classList.toggle('is-invalid', !okUser);
      installerPassword.classList.toggle('is-invalid', !okPass);
      return okHost && okPort && okUser && okPass;
    }

    if (step === 2) {
      const okDb = dbName.value.trim().length >= 1;
      const okAppUser = appDbUser.value.trim().length >= 1;
      const okAppPass = appDbPassword.value.length >= 1;
      dbName.classList.toggle('is-invalid', !okDb);
      appDbUser.classList.toggle('is-invalid', !okAppUser);
      appDbPassword.classList.toggle('is-invalid', !okAppPass);
      return okDb && okAppUser && okAppPass;
    }

    if (step === 3) {
      const ok = companyName.value.trim().length >= 2;
      companyName.classList.toggle('is-invalid', !ok);
      return ok;
    }

    if (step === 4) {
      const okName = adminName.value.trim().length >= 2;
      const okUser = adminUser.value.trim().length >= 3;
      const p1 = adminPassword.value;
      const p2 = adminPassword2.value;
      const okLen = p1.length >= 8;
      const okMatch = p1 === p2;
      adminName.classList.toggle('is-invalid', !okName);
      adminUser.classList.toggle('is-invalid', !okUser);
      adminPassword.classList.toggle('is-invalid', !okLen);
      adminPassword2.classList.toggle('is-invalid', !okMatch);
      return okName && okUser && okLen && okMatch;
    }

    return true;
  }

  async function checkStatus() {
    try {
      const res = await fetch('/setup-api/status');
      const data = await res.json();
      if (data && data.configured) {
        setStatus('El sistema ya esta configurado. Redirigiendo al login...', 'success');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 1200);
        form.classList.add('d-none');
        return;
      }
      setStatus('Sistema sin configurar. Completa el wizard para inicializar.', 'info');
    } catch (error) {
      setStatus('No se pudo validar el estado del sistema.', 'danger');
    }
  }

  async function submitSetup(event) {
    event.preventDefault();
    if (!validateStep()) return;

    const payload = {
      dbHost: document.getElementById('dbHost').value.trim(),
      dbPort: Number(document.getElementById('dbPort').value.trim() || '5432'),
      installerUser: document.getElementById('installerUser').value.trim(),
      installerPassword: document.getElementById('installerPassword').value,
      dbName: document.getElementById('dbName').value.trim(),
      appDbUser: document.getElementById('appDbUser').value.trim(),
      appDbPassword: document.getElementById('appDbPassword').value,
      companyName: document.getElementById('companyName').value.trim(),
      adminName: document.getElementById('adminName').value.trim(),
      adminUser: document.getElementById('adminUser').value.trim(),
      adminPassword: document.getElementById('adminPassword').value,
    };

    btnFinish.disabled = true;
    setStatus('Creando DB, esquema y usuario administrador...', 'warning');

    try {
      const res = await fetch('/setup-api/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const detail = data.details ? ` (${data.details})` : '';
        setStatus((data.error || 'No se pudo completar el setup.') + detail, 'danger');
        btnFinish.disabled = false;
        return;
      }

      setStatus('Setup completado. La configuración sensible quedó persistida en el servidor. Reinicia la app para aplicar los cambios.', 'success');
      btnNext.classList.add('d-none');
      btnPrev.disabled = true;
      btnFinish.disabled = true;
    } catch (error) {
      setStatus('Error de red al completar setup.', 'danger');
      btnFinish.disabled = false;
    }
  }

  btnPrev.addEventListener('click', () => showStep(step - 1));
  btnNext.addEventListener('click', () => {
    if (!validateStep()) return;
    showStep(step + 1);
  });

  form.addEventListener('submit', submitSetup);

  showStep(1);
  checkStatus();
})();
