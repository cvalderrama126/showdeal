(function () {
  const STORAGE_KEY = "showdeal_ui_theme_v1";
  const THEME_VARS = [
    "--sd-primary",
    "--sd-primary-2",
    "--sd-bg",
    "--sd-card",
    "--sd-dark",
    "--sd-dark-2",
    "--sd-orange",
  ];

  const DEFAULT_THEME = {
    "--sd-primary": "#f84300",
    "--sd-primary-2": "#ff6a3d",
    "--sd-bg": "#ffffff",
    "--sd-card": "#ffffff",
    "--sd-dark": "#0b1220",
    "--sd-dark-2": "#0f1a2d",
    "--sd-orange": "#ff4d00",
  };

  function isColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
  }

  function sanitizeTheme(input) {
    const out = {};
    for (const key of THEME_VARS) {
      const value = input?.[key];
      if (isColor(value)) out[key] = String(value).trim();
    }
    return out;
  }

  function applyTheme(theme = {}) {
    const finalTheme = { ...getCurrentTheme(), ...sanitizeTheme(theme) };
    for (const key of THEME_VARS) {
      const value = finalTheme[key] || DEFAULT_THEME[key];
      document.documentElement.style.setProperty(key, value);
    }
    return getCurrentTheme();
  }

  function getDefaultTheme() {
    return { ...DEFAULT_THEME };
  }

  function getCurrentTheme() {
    const styles = getComputedStyle(document.documentElement);
    const result = {};
    for (const key of THEME_VARS) {
      const value = String(styles.getPropertyValue(key) || "").trim();
      result[key] = isColor(value) ? value : DEFAULT_THEME[key];
    }
    return result;
  }

  function saveTheme(theme) {
    if (theme && typeof theme === "object") {
      applyTheme(theme);
    }
    const current = getCurrentTheme();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    return current;
  }

  function resetTheme() {
    localStorage.removeItem(STORAGE_KEY);
    return applyTheme(DEFAULT_THEME);
  }

  function applySavedTheme() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        applyTheme(DEFAULT_THEME);
        return;
      }
      const saved = JSON.parse(raw);
      applyTheme(saved);
    } catch (_err) {
      applyTheme(DEFAULT_THEME);
    }
  }

  window.SD_THEME = {
    getCurrentTheme,
    applyTheme,
    saveTheme,
    resetTheme,
    getDefaultTheme,
  };

  applySavedTheme();
})();
