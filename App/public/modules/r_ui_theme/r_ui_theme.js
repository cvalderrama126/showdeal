async function init_r_ui_theme() {
  const feedbackHost = document.getElementById("themeAssistantFeedback");
  const manager = window.SD_THEME;
  if (!manager) {
    if (feedbackHost) {
      feedbackHost.innerHTML = '<div class="alert alert-danger mb-0">No se encontró SD_THEME.</div>';
    }
    return;
  }

  const INPUTS = {
    "--sd-primary": document.getElementById("themeVarPrimary"),
    "--sd-primary-2": document.getElementById("themeVarPrimary2"),
    "--sd-orange": document.getElementById("themeVarOrange"),
    "--sd-bg": document.getElementById("themeVarBg"),
    "--sd-card": document.getElementById("themeVarCard"),
    "--sd-dark": document.getElementById("themeVarDark"),
  };

  const PRESETS = {
    default: manager.getDefaultTheme(),
    ocean: {
      "--sd-primary": "#0066cc",
      "--sd-primary-2": "#1e88e5",
      "--sd-orange": "#00a3cc",
      "--sd-bg": "#f4faff",
      "--sd-card": "#ffffff",
      "--sd-dark": "#0a2740",
      "--sd-dark-2": "#113552",
    },
    forest: {
      "--sd-primary": "#1f7a3f",
      "--sd-primary-2": "#2b9950",
      "--sd-orange": "#4ea85f",
      "--sd-bg": "#f4faf5",
      "--sd-card": "#ffffff",
      "--sd-dark": "#10261a",
      "--sd-dark-2": "#163325",
    },
    midnight: {
      "--sd-primary": "#8b5cf6",
      "--sd-primary-2": "#a78bfa",
      "--sd-orange": "#7c3aed",
      "--sd-bg": "#f7f6ff",
      "--sd-card": "#ffffff",
      "--sd-dark": "#111827",
      "--sd-dark-2": "#1f2937",
    },
  };

  function showFeedback(type, message) {
    if (!feedbackHost) return;
    feedbackHost.innerHTML = "";
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} py-2 mb-0`;
    const text = document.createElement("div");
    text.className = "small";
    text.textContent = String(message || "");
    alert.appendChild(text);
    feedbackHost.appendChild(alert);
  }

  function readThemeFromInputs() {
    const theme = {};
    Object.entries(INPUTS).forEach(([key, input]) => {
      if (input?.value) theme[key] = input.value;
    });
    return theme;
  }

  function syncInputs(theme) {
    Object.entries(INPUTS).forEach(([key, input]) => {
      if (!input) return;
      if (theme?.[key]) input.value = theme[key];
    });
  }

  syncInputs(manager.getCurrentTheme());

  document.getElementById("btnThemeApply")?.addEventListener("click", () => {
    manager.applyTheme(readThemeFromInputs());
    showFeedback("info", "Tema aplicado temporalmente. Usa “Guardar preferencia” para persistirlo.");
  });

  document.getElementById("btnThemeSave")?.addEventListener("click", () => {
    manager.saveTheme(readThemeFromInputs());
    showFeedback("success", "Preferencia de tema guardada en este navegador.");
  });

  document.getElementById("btnThemeReset")?.addEventListener("click", () => {
    const theme = manager.resetTheme();
    syncInputs(theme);
    showFeedback("warning", "Tema restablecido al valor por defecto.");
  });

  document.querySelectorAll("[data-theme-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = String(button.getAttribute("data-theme-preset") || "");
      const preset = PRESETS[key];
      if (!preset) return;
      const applied = manager.applyTheme(preset);
      syncInputs(applied);
      showFeedback("info", `Preset “${key}” aplicado.`);
    });
  });
}
