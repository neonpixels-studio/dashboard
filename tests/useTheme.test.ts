import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "../app/composables/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("setTheme('dark') marks isDark and adds the dark class", () => {
    const { isDark, setTheme } = useTheme();
    setTheme("dark");
    expect(isDark.value).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme flips between light and dark", () => {
    const { isDark, setTheme, toggleTheme } = useTheme();
    setTheme("light");
    expect(isDark.value).toBe(false);
    toggleTheme();
    expect(isDark.value).toBe(true);
    expect(localStorage.getItem("db_theme")).toBe("dark");
  });

  it("initTheme reads a stored preference", () => {
    localStorage.setItem("db_theme", "dark");
    const { isDark, initTheme } = useTheme();
    initTheme();
    expect(isDark.value).toBe(true);
  });
});
