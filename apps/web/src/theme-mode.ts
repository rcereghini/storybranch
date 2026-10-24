// Light, dark or follow the system. The choice is a per-browser preference:
// it lives in localStorage (which may be unavailable) and index.html applies
// it before first paint so the view never flashes the other theme.
export type ThemeMode = "system" | "light" | "dark";
const KEY = "storybranch-theme";

export function storedThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Without storage the choice lasts until the view reloads.
  }
  // Keep the browser's UI color in step with the view.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getComputedStyle(root).getPropertyValue("--bg").trim(),
    );
}
