const STORAGE_KEY = "bwTheme";
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return darkQuery?.matches ? "dark" : "light";
}

function applyTheme(button, theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("theme-dark", dark);
  // lets scrollbars and form controls follow the page theme
  document.documentElement.style.colorScheme = theme;
  button.setAttribute("aria-pressed", String(dark));
  button.title = dark ? "Switch to light theme" : "Switch to dark theme";
}

// follows the system theme until the toggle is used
// only a click saves a choice, so a later system change still applies before that
export function initTheme(button) {
  // also kept here, so a click still wins when the browser blocks storage
  let chosen = storedTheme();
  applyTheme(button, chosen ?? systemTheme());

  darkQuery?.addEventListener?.("change", () => {
    if (!chosen) applyTheme(button, systemTheme());
  });

  button.addEventListener("click", () => {
    chosen = document.body.classList.contains("theme-dark") ? "light" : "dark";
    try { localStorage.setItem(STORAGE_KEY, chosen); } catch {}
    applyTheme(button, chosen);
  });
}
