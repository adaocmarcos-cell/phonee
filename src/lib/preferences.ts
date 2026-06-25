const FONT_KEY = "ui.fontSize";
const THEME_KEY = "ui.theme";

export const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24] as const;
export type Theme = "light" | "dark" | "ocean" | "clean";

export const THEMES: { id: Theme; name: string; description: string }[] = [
  {
    id: "light",
    name: "Phonee Clássico",
    description: "Tema padrão: canvas claro, sidebar navy, brand azul elétrico.",
  },
  {
    id: "dark",
    name: "Modo Escuro",
    description: "Tons escuros para reduzir o cansaço visual à noite.",
  },
  {
    id: "ocean",
    name: "Ocean Mono",
    description: "Monocromático azul: fundo navy profundo, detalhes em azul médio.",
  },
  {
    id: "clean",
    name: "Clean Blue",
    description: "Fundo branco e neutro com botões e acentos em azul médio.",
  },
];

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
  if (v === "dark" || v === "light" || v === "ocean" || v === "clean") return v;
  return "light";
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Themes "dark" e "ocean" usam variantes Tailwind `dark:` para herdar contraste;
  // "ocean" também ganha overrides azuis via `.theme-ocean`.
  const isDarkBase = theme === "dark" || theme === "ocean";
  root.classList.toggle("dark", isDarkBase);
  root.classList.toggle("theme-ocean", theme === "ocean");
  root.classList.toggle("theme-clean", theme === "clean");
}

export function initPreferences() {
  applyFontSize(getFontSize());
  applyTheme(getTheme());
}