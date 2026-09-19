const STORAGE_KEY_THEME = "db_theme";
const STORAGE_KEY_THEME_CHOICE = "db_theme_choice";
const STORAGE_KEY_ACCENT = "db_accent";
const CSS_VAR_ACCENT = "--accent";
const DEFAULT_ACCENT = "#a855f7";

// Module-level singleton so all callers share the same isDark ref.
// All mutations are client-only (guarded by typeof window / onMounted / .client plugin)
// so this is safe. If SSR ever needs to read/write isDark, switch to useState instead.
const isDark = ref(false);

export function useTheme() {
  const applyDark = (dark: boolean) => {
    isDark.value = dark;
    document.documentElement.classList.toggle("dark", dark);
  };

  const initTheme = () => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored === "dark" || stored === "light") {
      applyDark(stored === "dark");
      return;
    }
    applyDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  };

  const setTheme = (theme: "dark" | "light") => {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
    applyDark(theme === "dark");
  };

  const toggleTheme = () => {
    setTheme(isDark.value ? "light" : "dark");
  };

  const applyAccent = (hex: string) => {
    document.documentElement.style.setProperty(CSS_VAR_ACCENT, hex);
  };

  const initAccent = () => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY_ACCENT);
    applyAccent(stored ?? DEFAULT_ACCENT);
  };

  const persistAccentLocally = (hex: string) => {
    localStorage.setItem(STORAGE_KEY_ACCENT, hex);
    applyAccent(hex);
  };

  const persistThemeChoiceLocally = (themeChoice: string) => {
    localStorage.setItem(STORAGE_KEY_THEME_CHOICE, themeChoice);
  };

  const getStoredThemeChoice = (): string | null => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY_THEME_CHOICE);
  };

  const getStoredAccent = (): string | null => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY_ACCENT);
  };

  return {
    isDark,
    initTheme,
    setTheme,
    toggleTheme,
    applyAccent,
    initAccent,
    persistAccentLocally,
    persistThemeChoiceLocally,
    getStoredThemeChoice,
    getStoredAccent,
  };
}
