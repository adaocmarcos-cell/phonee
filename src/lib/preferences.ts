const FONT_KEY = "ui.fontSize";
const THEME_KEY = "ui.theme";

export const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24] as const;
export type Theme = "light" | "dark";

export function getFontSize(): number {
  const raw = Number(localStorage.getItem(FONT_KEY));
  return Number.isFinite(raw) && raw >= 10 && raw <= 28 ? raw : 16;
}

export function setFontSize(px: number) {
  localStorage.setItem(FONT_KEY, String(px));
  applyFontSize(px);
}

export function applyFontSize(px: number) {
  document.documentElement.style.fontSize = `${px}px`;
}

export function getTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  if (v === "dark" || v === "light") return v;
  return "light";
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function initPreferences() {
  applyFontSize(getFontSize());
  applyTheme(getTheme());
}